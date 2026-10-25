/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import path from 'node:path'
import sharp from 'sharp'
import { removeCover, withCoverFiles } from './coverFiles.js'
import { coversDir } from './covers.js'
import { httpError } from './errors.js'
import { EDITION_ORDER, bookCover, createLibrary, pickedEdition } from './library.js'
import { DEFAULT_MODEL, createAnthropic } from './lookup/anthropic.js'
import { reader, shared } from './lookup/index.js'

// The slot a found cover goes to is the one bookCover() reads first: the picked edition, else the book.
const STATE = `
  SELECT b.title, a.name AS author, b.cover AS book_cover, b.created_at AS book_created_at,
         ${pickedEdition('id')} AS edition_id, ${pickedEdition('cover')} AS edition_cover,
         ${pickedEdition('created_at')} AS edition_created_at, ${pickedEdition('isbn')} AS picked_isbn,
         (SELECT e.isbn FROM editions e WHERE e.book_id = b.id AND e.isbn IS NOT NULL ORDER BY ${EDITION_ORDER} LIMIT 1) AS any_isbn,
         ${bookCover('b')} AS shown
  FROM books b JOIN authors a ON a.id = b.author_id
  WHERE b.id = ?`

const NONE = { width: 0, height: 0 }

// The size as shown, after any EXIF orientation of a file stored before covers were turned upright.
async function dimensions(filename) {
  return (await sharp(path.join(coversDir, filename)).metadata()).autoOrient
}

// Resolves findCover(bookId) to { status, body }: 200 { replaced, book, source_url, width, height }, 404, 502
// or 503; an unknown book, or one deleted or given another cover during the search, rejects with a 404 or
// 409. Each call is one Claude search, never cached; concurrent calls for one book share it.
export function createCoverFinder({ db, apiKey = null, model = null, saveCover, fetch = globalThis.fetch, timeoutMs, log = console.warn, anthropic = createAnthropic }) {
  const library = createLibrary(db)
  const readKey = reader(apiKey)
  const readModel = reader(model)
  const stateOf = db.prepare(STATE)

  function state(id) {
    const row = stateOf.get(id)
    if (!row) throw httpError(404, 'Book not found')
    const slot = row.edition_id === null
      ? { table: 'books', id, cover: row.book_cover, created_at: row.book_created_at }
      : { table: 'editions', id: row.edition_id, cover: row.edition_cover, created_at: row.edition_created_at }
    const isbn = row.picked_isbn ?? row.any_isbn
    return { subject: isbn ? { isbn } : { title: row.title, author: row.author }, slot, shown: row.shown }
  }

  async function search(subject) {
    try {
      return await anthropic({ apiKey: readKey(), model: readModel() ?? DEFAULT_MODEL, fetch, timeoutMs, log }).findCover(subject)
    } catch (err) {
      const key = readKey()
      log(`Claude cover search failed: ${key ? String(err.message).split(key).join('[redacted]') : err.message}`)
      return { status: 'failed', message: 'an unexpected error' }
    }
  }

  const find = shared(async (id) => {
    const before = state(id)
    const result = await search(before.subject)
    if (result.status === 'not_found') return { status: 404, body: { error: 'No cover found for this book' } }
    if (result.status !== 'ok') return { status: 502, body: { error: `The cover search failed: ${result.message ?? 'no answer'}` } }
    const { slot } = before
    const filename = await saveCover(result.cover_url, `${slot.table === 'books' ? 'b' : 'e'}${slot.id}`)
    if (!filename) return { status: 502, body: { error: `The cover Claude found could not be downloaded from ${new URL(result.cover_url).host}` } }

    let kept = false
    try {
      const found = await dimensions(filename)
      const current = before.shown ? await dimensions(before.shown).catch(() => NONE) : NONE
      const answer = (replaced) => ({ status: 200, body: { replaced, book: library.getBook(id), source_url: result.source_url, width: found.width, height: found.height } })
      if (found.width <= current.width) return answer(false)
      withCoverFiles(db, (files) => {
        const now = state(id)
        if (JSON.stringify([now.slot, now.shown]) !== JSON.stringify([slot, before.shown])) throw httpError(409, 'The cover changed during the search; try again')
        files.discard(slot.cover)
        if (slot.table === 'books') library.updateBook(id, { cover: filename })
        else library.updateEdition(slot.id, { cover: filename })
      })
      kept = true
      return answer(true)
    } finally {
      if (!kept) removeCover(filename)
    }
  })

  return async function findCover(id) {
    if (!readKey()) return { status: 503, body: { error: 'Claude is not configured' } }
    return find(id)
  }
}
