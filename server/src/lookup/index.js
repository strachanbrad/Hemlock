/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { config, userAgent } from '../config.js'
import { DEFAULT_MODEL, createAnthropic } from './anthropic.js'
import { createGoogle } from './google.js'
import { answer } from './merge.js'
import { createOpenLibrary } from './openLibrary.js'

export const CACHE_MS = 24 * 60 * 60 * 1000
const CACHE_ENTRIES = 500
// Open Library allows 1 request a second, or 3 when the User-Agent names a contact.
export const OPEN_LIBRARY_INTERVAL_MS = 1000
export const OPEN_LIBRARY_CONTACT_INTERVAL_MS = 334

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// A key, contact or model is a value or a getter; a getter is read at each lookup, so a setting
// saved on the admin page applies without a restart.
export const reader = (value) => (typeof value === 'function' ? () => value() ?? null : () => value ?? null)

function createCache(now) {
  const entries = new Map()
  return {
    get(key) {
      const hit = entries.get(key)
      if (hit && now() - hit.at < CACHE_MS) return hit.value
      entries.delete(key)
      return undefined
    },
    set(key, value) {
      entries.set(key, { at: now(), value })
      if (entries.size > CACHE_ENTRIES) entries.delete(entries.keys().next().value)
    },
  }
}

// Concurrent calls with one key share one request.
export function shared(run) {
  const pending = new Map()
  return (key) => {
    if (!pending.has(key)) pending.set(key, run(key).finally(() => pending.delete(key)))
    return pending.get(key)
  }
}

// Resolves lookup(isbn13) to { status: 200 | 404 | 502, body }; never rejects for an upstream problem.
export function createLookup({ fetch = globalThis.fetch, googleKey = null, contact = null, anthropicKey = null, now = Date.now, sleep = realSleep, timeoutMs, log = console.warn } = {}) {
  const readGoogleKey = reader(googleKey)
  const readContact = reader(contact)
  const readAnthropicKey = reader(anthropicKey)
  const agent = () => userAgent(config.version, readContact())
  const interval = () => (readContact() ? OPEN_LIBRARY_CONTACT_INTERVAL_MS : OPEN_LIBRARY_INTERVAL_MS)
  const openLibrary = createOpenLibrary({ fetch, userAgent: agent, interval, now, sleep, timeoutMs, log })
  let google = { key: null, ask: null }
  const googleWith = (key) => {
    if (google.key !== key) google = { key, ask: createGoogle({ fetch, key, userAgent: agent, now, sleep, timeoutMs, log }) }
    return google.ask
  }
  const cache = createCache(now)

  // Only a complete 'ok' answer is kept: a book missing today may be catalogued tomorrow, and a
  // failure or a partial answer (a follow-up request failed) is asked again.
  const cached = (source, ask) => async (isbn, ...rest) => {
    const key = `${source}:${isbn}`
    const hit = cache.get(key)
    if (hit) return hit
    const result = await ask(isbn, ...rest).catch((err) => {
      log(`${source} lookup of ${isbn} failed: ${err.message}`)
      return { status: 'failed' }
    })
    if (result.status === 'ok' && !result.partial) cache.set(key, result)
    return result
  }

  const askOpenLibrary = cached('Open Library', openLibrary)
  const askGoogleWith = cached('Google Books', (isbn, key) => googleWith(key)(isbn))
  const askGoogle = async (isbn) => {
    const key = readGoogleKey()
    return key ? askGoogleWith(isbn, key) : { status: 'disabled' }
  }

  return shared((isbn) =>
    Promise.all([askGoogle(isbn), askOpenLibrary(isbn)]).then(([fromGoogle, fromOpenLibrary]) =>
      answer(isbn, fromGoogle, fromOpenLibrary, { claude: Boolean(readAnthropicKey()) })))
}

const RECORD_FIELDS = ['title', 'authors', 'publisher', 'published', 'synopsis', 'format', 'cover_url']

export function identifyAnswer(isbn, result) {
  if (result.status === 'ok') {
    const { record } = result
    const has = (field) => (Array.isArray(record[field]) ? record[field].length > 0 : record[field] !== null && record[field] !== undefined)
    const fields = Object.fromEntries(RECORD_FIELDS.filter(has).map((field) => [field, 'anthropic']))
    return { status: 200, body: { ...record, sources: { anthropic: 'ok', fields } } }
  }
  if (result.status === 'not_found') return { status: 404, body: { error: `Claude found no listing that shows ISBN ${isbn}` } }
  return { status: 502, body: { error: `The Claude lookup failed: ${result.message ?? 'no answer'}` } }
}

// Resolves identify(isbn13) to { status: 200 | 404 | 502 | 503, body }; never rejects for an upstream
// problem. Asks Claude only, never the catalogues; an 'ok' answer is kept as long as a source's.
export function createIdentify({ fetch = globalThis.fetch, apiKey = null, model = null, now = Date.now, timeoutMs, log = console.warn, anthropic = createAnthropic } = {}) {
  const readKey = reader(apiKey)
  const readModel = reader(model)
  const cache = createCache(now)

  const ask = shared((isbn) =>
    Promise.resolve()
      .then(() => anthropic({ apiKey: readKey(), model: readModel() ?? DEFAULT_MODEL, fetch, timeoutMs, log }).identify(isbn))
      .catch((err) => {
        const key = readKey()
        log(`Claude lookup of ${isbn} failed: ${key ? String(err.message).split(key).join('[redacted]') : err.message}`)
        return { status: 'failed', message: 'an unexpected error' }
      })
      .then((result) => {
        if (result.status === 'ok') cache.set(isbn, result)
        return identifyAnswer(isbn, result)
      }))

  return async function identify(isbn) {
    if (!readKey()) return { status: 503, body: { error: 'Claude is not configured' } }
    const hit = cache.get(isbn)
    return hit ? identifyAnswer(isbn, hit) : ask(isbn)
  }
}
