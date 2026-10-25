/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { httpError } from './errors.js'

export const coversDir = path.join(config.dataDir, 'covers')
export const MAX_COVER_BYTES = 10 * 1024 * 1024

const COVER_NAME = /^(e\d+-[0-9a-f]{8}|b\d+-[0-9a-f]{8}|\d{13})\.(jpg|png|webp)$/
const ISBN_KEY = /^(\d{13}|\d{9}[\dX])$/
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function imageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png'
  if (buffer.length >= 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  return null
}

// Under the Books/EBooks schema a cover is <isbn>.jpg whatever its type, replaced in place.
export function saveCoverFromUpload(file, isbn) {
  if (!imageType(file.buffer)) throw httpError(400, 'The cover must be a JPEG, PNG or WebP image')
  if (!ISBN_KEY.test(isbn)) throw httpError(400, 'A cover needs a 10 or 13 digit ISBN')

  fs.mkdirSync(coversDir, { recursive: true })
  const filename = `${isbn}.jpg`
  // The temp file stays in coversDir: a rename across mounts (PrivateTmp) fails with EXDEV.
  const temp = path.join(coversDir, `.${filename}.${crypto.randomBytes(4).toString('hex')}.tmp`)
  fs.writeFileSync(temp, file.buffer, { flag: 'wx' })
  try {
    fs.renameSync(temp, path.join(coversDir, filename))
  } catch (err) {
    fs.rmSync(temp, { force: true })
    throw err
  }
  return filename
}

export function deleteCover(filename) {
  if (!COVER_NAME.test(filename)) throw new Error(`Refusing to delete a cover named ${JSON.stringify(filename)}`)
  try {
    fs.unlinkSync(path.join(coversDir, filename))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}
