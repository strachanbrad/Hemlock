/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import multer from 'multer'

export function httpError(status, message) {
  return Object.assign(new Error(message), { status, expose: true })
}

const UNIQUE = new Set(['SQLITE_CONSTRAINT_PRIMARYKEY', 'SQLITE_CONSTRAINT_UNIQUE'])

// CRITICAL: Express treats a middleware as an error handler only when it declares four parameters.
export function errorHandler(err, req, res, _next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'The cover is larger than 10 MB' })
    return res.status(400).json({ error: err.message })
  }

  if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
    console.error(`${req.method} ${req.originalUrl}: ${err.code}: ${err.message}`)
    if (UNIQUE.has(err.code)) return res.status(409).json({ error: 'A record with that key already exists' })
    return res.status(400).json({ error: 'The data breaks a database constraint' })
  }

  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.expose ? err.message : 'Bad request' })
  }

  console.error(`${req.method} ${req.originalUrl}:`, err)
  res.status(500).json({ error: 'Internal server error' })
}
