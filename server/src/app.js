/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import express from 'express'
import { config } from './config.js'
import { coversDir, saveCoverFromUrl } from './covers.js'
import { errorHandler } from './errors.js'
import { createLookup } from './lookup/index.js'
import authorRoutes from './routes/authors.js'
import bookRoutes from './routes/books.js'
import displayRoutes from './routes/display.js'
import editionRoutes from './routes/editions.js'
import healthRoutes from './routes/health.js'
import lookupRoutes from './routes/lookup.js'

export function createApp({ db, lookup = createLookup({ googleKey: config.googleBooksApiKey, contact: config.lookupContact }), saveCover = saveCoverFromUrl }) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json())

  app.use('/api', healthRoutes(db), lookupRoutes(lookup), authorRoutes(db), displayRoutes(db), bookRoutes(db, saveCover), editionRoutes(db, saveCover))
  app.use('/covers', express.static(coversDir, { index: false }))

  app.use((req, res) => res.status(404).json({ error: 'Not found' }))
  app.use(errorHandler)
  return app
}
