/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import multer from 'multer'
import { MAX_COVER_BYTES } from './covers.js'
import { httpError } from './errors.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COVER_BYTES, files: 1, fields: 1, parts: 2 },
}).single('cover')

// Sets req.payload (the JSON body, or the parsed `data` part of a multipart body) and
// req.cover (the multer file or null). Multer hands every field as a string, so a
// multipart body carries its payload as one JSON string and nothing else.
export function readBody(req, res, next) {
  if (!req.is('multipart/form-data')) {
    req.payload = req.body
    req.cover = null
    return next()
  }
  upload(req, res, (err) => {
    if (err) return next(err)
    const parts = Object.keys(req.body)
    if (parts.some((part) => part !== 'data')) return next(httpError(400, 'A multipart body has only a data part and a cover file'))
    if (typeof req.body.data !== 'string') return next(httpError(400, 'A multipart body needs a data part'))
    try {
      req.payload = JSON.parse(req.body.data)
    } catch {
      return next(httpError(400, 'The data part is not valid JSON'))
    }
    req.cover = req.file ?? null
    next()
  })
}
