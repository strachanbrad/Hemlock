/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { isbn13To10 } from '../lib/isbn.js'
import { createJsonSource } from './http.js'
import { pick } from './merge.js'

export const GOOGLE_BOOKS = 'https://www.googleapis.com/books/v1/volumes'
export const VOLUME_FIELDS = ['title', 'authors', 'publisher', 'publishedDate', 'description', 'industryIdentifiers', 'imageLinks']

export const volumesUrl = (isbn, key) => `${GOOGLE_BOOKS}?q=isbn:${isbn}&key=${encodeURIComponent(key)}`
export const volumeUrl = (id, key) => `${GOOGLE_BOOKS}/${id}?key=${encodeURIComponent(key)}`
export const DYNAMIC_LINKS = 'https://books.google.com/books'
export const dynamicLinksUrl = (isbn) => `${DYNAMIC_LINKS}?bibkeys=ISBN:${isbn}&jscmd=viewapi`

// The id becomes a URL path segment, so nothing but an id's own characters passes.
const VOLUME_ID = /^[A-Za-z0-9_-]+$/
const SCRIPT = /^\s*var _GBSBookInfo = ([\s\S]*?);?\s*$/

// q=isbn: also answers other editions of the work; only a volume that carries the ISBN is exact.
export function exactVolume(items, isbn) {
  const wanted = new Set([isbn, isbn13To10(isbn)].filter(Boolean))
  return items.find((item) => {
    const ids = item?.volumeInfo?.industryIdentifiers
    return Array.isArray(ids) && ids.some((id) => wanted.has(String(id?.identifier).toUpperCase()))
  })
}

// Dynamic Links answers JavaScript, `var _GBSBookInfo = {...};`. Returns the volume id it names for
// the ISBN, null when it names none, or undefined when the answer is not that script.
export function dynamicLinksId(script, isbn) {
  const match = typeof script === 'string' ? SCRIPT.exec(script) : null
  if (!match) return undefined
  let books
  try {
    books = JSON.parse(match[1])
  } catch {
    return undefined
  }
  if (!books || typeof books !== 'object' || Array.isArray(books)) return undefined
  const info = books[`ISBN:${isbn}`]?.info_url
  if (typeof info !== 'string' || !URL.canParse(info)) return null
  const id = new URL(info).searchParams.get('id')
  return id && VOLUME_ID.test(id) ? id : null
}

const found = (volume) => ({ status: 'ok', volume: pick(volume.volumeInfo, VOLUME_FIELDS) })
const NOT_FOUND = Object.freeze({ status: 'not_found' })

export function createGoogle({ fetch, key, userAgent, now, sleep, timeoutMs, log }) {
  const source = (name, accept) => createJsonSource({
    name,
    fetch,
    headers: () => ({ 'User-Agent': userAgent(), Accept: accept }),
    now,
    sleep,
    retryDelay: 500,
    timeoutMs,
    log,
  })
  const getJson = source('Google Books', 'application/json')
  const getScript = source('Google Books Dynamic Links', 'application/javascript')

  // Resolves to { status, volume?, named }: named says Dynamic Links knew a volume id for the ISBN.
  async function byId(isbn) {
    const links = await getScript(dynamicLinksUrl(isbn), { text: true })
    if (links.status !== 'ok') return { status: links.status, named: false }
    const id = dynamicLinksId(links.body, isbn)
    if (id === undefined) log('Google Books Dynamic Links /books: the answer is not the _GBSBookInfo script')
    if (!id) return { ...NOT_FOUND, named: false }
    const volume = await getJson(volumeUrl(id, key))
    if (volume.status !== 'ok') return { status: volume.status, named: true }
    return exactVolume([volume.body], isbn) ? { ...found(volume.body), named: true } : { ...NOT_FOUND, named: true }
  }

  return async function lookupGoogle(isbn) {
    const search = await getJson(volumesUrl(isbn, key))
    if (search.status === 'failed') return { status: 'failed' }
    const item = search.status === 'ok' ? exactVolume(Array.isArray(search.body?.items) ? search.body.items : [], isbn) : null
    if (item) return found(item)
    // The volumes search index misses many catalogued books that the volume-by-id request returns,
    // and Dynamic Links maps an ISBN to that id without the index.
    const second = await byId(isbn)
    if (second.status === 'ok') return { status: 'ok', volume: second.volume }
    return second.status === 'failed' && second.named ? { status: 'failed' } : NOT_FOUND
  }
}

const PROBE_ISBN = '9780553212587'

// One request with the key, for the admin page's Test button. Resolves to { ok: true, detail } or
// { ok: false, error } with Google's own message; never rejects.
export async function probeGoogle({ fetch = globalThis.fetch, key, userAgent, timeoutMs = 8000 }) {
  let response
  let body
  try {
    response = await fetch(volumesUrl(PROBE_ISBN, key), { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
    body = await response.json().catch(() => null)
  } catch (err) {
    return { ok: false, error: `Google Books did not answer: ${err.name === 'TimeoutError' ? `no answer in ${timeoutMs} ms` : err.message}` }
  }
  if (!response.ok) {
    const message = typeof body?.error?.message === 'string' ? body.error.message : 'no message'
    return { ok: false, error: `Google Books answered HTTP ${response.status}: ${message}` }
  }
  const count = Number.isInteger(body?.totalItems) ? body.totalItems : 0
  return { ok: true, detail: `${count} ${count === 1 ? 'volume' : 'volumes'} for ISBN ${PROBE_ISBN}` }
}
