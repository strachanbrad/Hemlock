/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { config, userAgent } from '../config.js'
import { createGoogle } from './google.js'
import { answer } from './merge.js'
import { createOpenLibrary } from './openLibrary.js'

export const CACHE_MS = 24 * 60 * 60 * 1000
const CACHE_ENTRIES = 500
// Open Library allows 1 request a second, or 3 when the User-Agent names a contact.
export const OPEN_LIBRARY_INTERVAL_MS = 1000
export const OPEN_LIBRARY_CONTACT_INTERVAL_MS = 334

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Resolves lookup(isbn13) to { status: 200 | 404 | 502, body }; never rejects for an upstream problem.
export function createLookup({ fetch = globalThis.fetch, googleKey = null, contact = null, now = Date.now, sleep = realSleep, timeoutMs, log = console.warn } = {}) {
  const agent = userAgent(config.version, contact)
  const interval = contact ? OPEN_LIBRARY_CONTACT_INTERVAL_MS : OPEN_LIBRARY_INTERVAL_MS
  const openLibrary = createOpenLibrary({ fetch, userAgent: agent, interval, now, sleep, timeoutMs, log })
  const google = googleKey ? createGoogle({ fetch, key: googleKey, userAgent: agent, now, sleep, timeoutMs, log }) : null
  const cache = new Map()
  const pending = new Map()

  // Only a complete 'ok' answer is kept: a book missing today may be catalogued tomorrow, and a
  // failure or a partial answer (a follow-up request failed) is asked again.
  const cached = (source, ask) => async (isbn) => {
    const key = `${source}:${isbn}`
    const hit = cache.get(key)
    if (hit && now() - hit.at < CACHE_MS) return hit.result
    cache.delete(key)
    const result = await ask(isbn).catch((err) => {
      log(`${source} lookup of ${isbn} failed: ${err.message}`)
      return { status: 'failed' }
    })
    if (result.status === 'ok' && !result.partial) {
      cache.set(key, { at: now(), result })
      if (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value)
    }
    return result
  }

  const askOpenLibrary = cached('Open Library', openLibrary)
  const askGoogle = google ? cached('Google Books', google) : async () => ({ status: 'disabled' })

  return function lookup(isbn) {
    // Concurrent lookups of one ISBN share their requests.
    if (!pending.has(isbn)) {
      const request = Promise.all([askGoogle(isbn), askOpenLibrary(isbn)])
        .then(([fromGoogle, fromOpenLibrary]) => answer(isbn, fromGoogle, fromOpenLibrary))
        .finally(() => pending.delete(isbn))
      pending.set(isbn, request)
    }
    return pending.get(isbn)
  }
}
