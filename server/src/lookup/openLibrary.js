/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { isbn13To10 } from '../lib/isbn.js'
import { createJsonSource } from './http.js'
import { createLimiter } from './limiter.js'
import { normalizeDescription, pick } from './merge.js'

export const OPEN_LIBRARY = 'https://openlibrary.org'

const SEARCH_FIELDS = ['key', 'title', 'author_name', 'cover_i', 'editions', 'editions.key', 'editions.title', 'editions.publisher', 'editions.publish_date', 'editions.cover_i', 'editions.isbn']
export const DOC_FIELDS = ['key', 'title', 'author_name', 'cover_i']
export const SEARCH_EDITION_FIELDS = ['key', 'title', 'publisher', 'publish_date', 'cover_i', 'isbn']
export const EDITION_FIELDS = ['key', 'title', 'physical_format', 'description', 'publishers', 'publish_date', 'covers']
export const WORK_FIELDS = ['key', 'title', 'description', 'covers']

// Keys from an upstream answer become URL paths, so only these shapes are requested.
const EDITION_KEY = /^\/books\/OL\d+M$/
const WORK_KEY = /^\/works\/OL\d+W$/

export const searchUrl = (isbn) => `${OPEN_LIBRARY}/search.json?q=isbn:${isbn}&fields=${SEARCH_FIELDS.join(',')}`

// The search's edition is accepted only when its own ISBN list holds the ISBN; otherwise only the work is used.
function matchEdition(docs, isbn) {
  const wanted = new Set([isbn, isbn13To10(isbn)].filter(Boolean))
  for (const doc of docs) {
    const editions = Array.isArray(doc?.editions?.docs) ? doc.editions.docs : []
    const edition = editions.find((e) => Array.isArray(e?.isbn) && e.isbn.some((value) => wanted.has(String(value).toUpperCase())))
    if (edition) return { doc, edition }
  }
  return docs.length > 0 ? { doc: docs[0], edition: null } : null
}

export function createOpenLibrary({ fetch, userAgent, interval, now, sleep, timeoutMs, log }) {
  const getJson = createJsonSource({
    name: 'Open Library',
    fetch,
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    schedule: createLimiter({ interval, now, sleep }),
    now,
    sleep,
    timeoutMs,
    log,
  })

  async function record(key, shape, fields) {
    if (typeof key !== 'string' || !shape.test(key)) return { status: 'ok', body: null }
    const answer = await getJson(`${OPEN_LIBRARY}${key}.json`)
    if (answer.status === 'failed') return answer
    // A merged record answers with { type: /type/redirect, location } instead of its data.
    const usable = answer.status === 'ok' && answer.body?.type?.key !== '/type/redirect'
    return { status: 'ok', body: usable ? pick(answer.body, fields) : null }
  }

  return async function lookupOpenLibrary(isbn) {
    const search = await getJson(searchUrl(isbn))
    if (search.status !== 'ok') return { status: search.status }
    const docs = Array.isArray(search.body?.docs) ? search.body.docs.filter((doc) => doc && typeof doc === 'object') : []
    const match = matchEdition(docs, isbn)
    if (!match) return { status: 'not_found' }

    const edition = await record(match.edition?.key, EDITION_KEY, EDITION_FIELDS)
    if (edition.status === 'failed') return { status: 'failed' }

    // The work adds only its description: its title and cover are already in the search answer.
    // A failed work request costs only that, so the answer stands, marked partial.
    let work = { status: 'ok', body: null }
    if (!normalizeDescription(edition.body?.description)) work = await record(match.doc.key, WORK_KEY, WORK_FIELDS)
    const partial = work.status === 'failed'

    return {
      status: 'ok',
      partial,
      doc: pick(match.doc, DOC_FIELDS),
      searchEdition: match.edition ? pick(match.edition, SEARCH_EDITION_FIELDS) : null,
      edition: edition.body,
      work: work.body,
    }
  }
}
