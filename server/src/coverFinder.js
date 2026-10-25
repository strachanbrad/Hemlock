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
import { ISBN_COVERS } from './lookup/isbnCovers.js'

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

// Resolves findCover(bookId) to { status, body }: 200 { replaced, book, source, source_url, width, height },
// 404, 502 or 503; an unknown book, or one deleted or given another cover meanwhile, rejects with a 404 or
// 409. Stage one, free, downloads the covers addressed by the ISBN; stage two, only when that found
// nothing wider, is one Claude search and needs the key. Nothing is cached; concurrent calls for one book
// share one run.
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

  const widest = (candidates) => candidates.reduce((best, next) => (next.width > (best?.width ?? 0) ? next : best), null)

  const find = shared(async (id) => {
    const before = state(id)
    const { slot, subject } = before
    const base = `${slot.table === 'books' ? 'b' : 'e'}${slot.id}`
    const current = before.shown ? await dimensions(before.shown).catch(() => NONE) : NONE
    // Every file downloaded in this run; all but the one kept are removed at the end.
    const saved = []
    let kept = null
    const download = async (url, source, sourceUrl) => {
      const filename = url ? await saveCover(url, base) : null
      if (!filename) return null
      saved.push(filename)
      const size = await dimensions(filename).catch(() => null)
      return size && { source, source_url: sourceUrl, filename, width: size.width, height: size.height }
    }

    const answer = (replaced, cover) => ({
      status: 200,
      body: { replaced, book: library.getBook(id), source: cover.source, source_url: cover.source_url, width: cover.width, height: cover.height },
    })
    const replace = (cover) => {
      withCoverFiles(db, (files) => {
        const now = state(id)
        if (JSON.stringify([now.slot, now.shown]) !== JSON.stringify([slot, before.shown])) throw httpError(409, 'The cover changed during the search; try again')
        files.discard(slot.cover)
        if (slot.table === 'books') library.updateBook(id, { cover: cover.filename })
        else library.updateEdition(slot.id, { cover: cover.filename })
      })
      kept = cover.filename
      return answer(true, cover)
    }

    try {
      const candidates = []
      if (subject.isbn) {
        const free = await Promise.all(Object.entries(ISBN_COVERS).map(([source, urlOf]) => download(urlOf(subject.isbn), source, null)))
        candidates.push(...free.filter(Boolean))
        const best = widest(candidates)
        if (best && best.width > current.width) return replace(best)
      }
      if (!readKey()) return { status: 503, body: { error: 'Claude is not configured' } }

      const result = await search(subject)
      if (result.status === 'ok') {
        const found = await download(result.cover_url, 'claude', result.source_url)
        if (!found) return { status: 502, body: { error: `The cover Claude found could not be downloaded from ${new URL(result.cover_url).host}` } }
        candidates.push(found)
      } else if (result.status !== 'not_found') {
        return { status: 502, body: { error: `The cover search failed: ${result.message ?? 'no answer'}` } }
      }
      const best = widest(candidates)
      if (!best) return { status: 404, body: { error: 'No cover found for this book' } }
      return best.width > current.width ? replace(best) : answer(false, best)
    } finally {
      for (const filename of saved) if (filename !== kept) removeCover(filename)
    }
  })

  return find
}
