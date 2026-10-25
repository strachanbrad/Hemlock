/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import express from 'express'
import { coversDir } from './covers.js'
import { errorHandler } from './errors.js'
import authorRoutes from './routes/authors.js'
import bookRoutes from './routes/books.js'
import dataRoutes from './routes/data.js'
import healthRoutes from './routes/health.js'

export function createApp({ db }) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json())

  app.use('/api', healthRoutes(db), authorRoutes(db), dataRoutes(db), bookRoutes(db))
  app.use('/covers', express.static(coversDir, { index: false }))

  app.use((req, res) => res.status(404).json({ error: 'Not found' }))
  app.use(errorHandler)
  return app
}
