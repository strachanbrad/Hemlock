/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { coversDir, deleteCover, imageType } from './covers.js'
import { httpError } from './errors.js'

export function checkCoverType(file) {
  const ext = imageType(file.buffer)
  if (!ext) throw httpError(400, 'The cover must be a JPEG, PNG or WebP image')
  return ext
}

// A request carries at most one of: the multipart file, a cover_from_url, cover: null.
export function checkCoverSources(file, ...others) {
  const given = [file, ...others].filter((source) => source !== undefined && source !== null)
  if (given.length > 1) throw httpError(400, 'Send one cover at most: a file, a cover_from_url or cover: null')
  if (file) checkCoverType(file)
}

// `base` is e<edition id> or b<book id>; the random part gives a replaced cover a new URL.
export function writeCover(file, base) {
  const ext = checkCoverType(file)
  fs.mkdirSync(coversDir, { recursive: true })
  const filename = `${base}-${crypto.randomBytes(4).toString('hex')}.${ext}`
  fs.writeFileSync(path.join(coversDir, filename), file.buffer, { flag: 'wx' })
  return filename
}

function removeCover(filename) {
  try {
    deleteCover(filename)
  } catch (err) {
    console.error(`Cannot delete cover ${filename}: ${err.message}`)
  }
}

// Runs fn in one transaction. A cover written through files.write is removed if the
// transaction throws; a cover passed to files.discard is deleted only after it commits,
// so a rollback never loses a file that a row still names.
export function withCoverFiles(db, fn) {
  const written = []
  const stale = []
  const files = {
    write(file, base) {
      const filename = writeCover(file, base)
      written.push(filename)
      return filename
    },
    discard(filename) {
      if (filename) stale.push(filename)
    },
  }

  let result
  try {
    result = db.transaction(() => fn(files))()
  } catch (err) {
    for (const filename of written) removeCover(filename)
    throw err
  }
  for (const filename of stale) removeCover(filename)
  return result
}

const COVER_PREFIX = { books: 'b', editions: 'e' }

function coverPrefix(table) {
  const prefix = COVER_PREFIX[table]
  if (!prefix) throw new TypeError(`No covers in ${table}`)
  return prefix
}

// Records the row as its transaction leaves it, so it is called inside that transaction or
// before the first await after the commit. `table` is 'books' or 'editions', from code.
export function coverDownload(db, table, id, url) {
  coverPrefix(table)
  const { cover, created_at } = db.prepare(`SELECT cover, created_at FROM ${table} WHERE id = ?`).get(id)
  return { table, id, url, cover, created_at }
}

// Runs after the row's transaction commits, since a transaction cannot wait for a download.
// The file lands only on a row still holding the recorded cover and created_at, so a row
// deleted, given another cover, or replaced under a reused id meanwhile keeps its own.
export async function attachDownloadedCovers(db, downloads, saveCover) {
  for (const { table, id, url, cover, created_at } of downloads) {
    const filename = await saveCover(url, `${coverPrefix(table)}${id}`)
    if (!filename) continue
    const { changes } = db.prepare(`UPDATE ${table} SET cover = ? WHERE id = ? AND cover IS ? AND created_at = ?`).run(filename, id, cover, created_at)
    const stale = changes === 1 ? cover : filename
    if (stale) removeCover(stale)
  }
}
