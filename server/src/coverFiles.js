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
