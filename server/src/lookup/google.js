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

// q=isbn: also answers other editions of the work; only a volume that carries the ISBN is exact.
export function exactVolume(items, isbn) {
  const wanted = new Set([isbn, isbn13To10(isbn)].filter(Boolean))
  return items.find((item) => {
    const ids = item?.volumeInfo?.industryIdentifiers
    return Array.isArray(ids) && ids.some((id) => wanted.has(String(id?.identifier).toUpperCase()))
  })
}

export function createGoogle({ fetch, key, userAgent, now, sleep, timeoutMs, log }) {
  const getJson = createJsonSource({
    name: 'Google Books',
    fetch,
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    now,
    sleep,
    retryDelay: 500,
    timeoutMs,
    log,
  })

  return async function lookupGoogle(isbn) {
    const answer = await getJson(volumesUrl(isbn, key))
    if (answer.status !== 'ok') return { status: answer.status }
    const item = exactVolume(Array.isArray(answer.body?.items) ? answer.body.items : [], isbn)
    return item ? { status: 'ok', volume: pick(item.volumeInfo, VOLUME_FIELDS) } : { status: 'not_found' }
  }
}
