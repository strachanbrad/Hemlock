/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import express from 'express'
import { createSessions } from './auth.js'
import { config, userAgent } from './config.js'
import { createCoverFinder } from './coverFinder.js'
import { coversDir, saveCoverFromUrl } from './covers.js'
import { errorHandler } from './errors.js'
import { createEvents } from './events.js'
import { DEFAULT_MODEL, createAnthropic } from './lookup/anthropic.js'
import { probeGoogle } from './lookup/google.js'
import { createIdentify, createLookup } from './lookup/index.js'
import adminRoutes from './routes/admin.js'
import authorRoutes from './routes/authors.js'
import bookRoutes from './routes/books.js'
import displayRoutes from './routes/display.js'
import editionRoutes from './routes/editions.js'
import healthRoutes from './routes/health.js'
import lookupRoutes from './routes/lookup.js'
import { createSettings } from './settings.js'

const WRITES = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

// Every consumer reads its key, contact and model from `settings` at request time.
export function createApp({ db, settings = createSettings(db), lookup, identify, probes, saveCover, findCover, events = createEvents(), secure = config.production, now = Date.now }) {
  const setting = (name) => () => settings.get(name)
  const agent = () => userAgent(config.version, settings.get('lookup_contact'))
  lookup ??= createLookup({ googleKey: setting('google_books_api_key'), contact: setting('lookup_contact'), anthropicKey: setting('anthropic_api_key') })
  identify ??= createIdentify({ apiKey: setting('anthropic_api_key'), model: setting('anthropic_model'), contact: setting('lookup_contact') })
  probes ??= {
    google: (key) => probeGoogle({ key, userAgent: agent() }),
    anthropic: (key) => createAnthropic({ apiKey: key, model: settings.get('anthropic_model') ?? DEFAULT_MODEL }).probe(),
  }
  saveCover ??= (url, base) => saveCoverFromUrl(url, base, { userAgent: agent() })
  findCover ??= createCoverFinder({ db, apiKey: setting('anthropic_api_key'), model: setting('anthropic_model'), saveCover })

  const app = express()
  app.disable('x-powered-by')
  app.use(express.json())

  // A library write that succeeded tells every open page; a refused one changed nothing.
  app.use(['/api/books', '/api/editions', '/api/authors'], (req, res, next) => {
    if (WRITES.has(req.method)) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) events.publish('library')
      })
    }
    next()
  })
  app.get('/api/events', events.handler)
  app.get('/api/changes', events.changes)

  app.use(
    '/api',
    adminRoutes({ db, settings, sessions: createSessions(db, { now }), probes, secure, now }),
    healthRoutes(db),
    lookupRoutes(lookup, identify),
    authorRoutes(db),
    displayRoutes(db),
    bookRoutes(db, saveCover, findCover),
    editionRoutes(db, saveCover),
  )
  app.use('/covers', express.static(coversDir, { index: false }))

  app.use((req, res) => res.status(404).json({ error: 'Not found' }))
  app.use(errorHandler)
  return app
}
