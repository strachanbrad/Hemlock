/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import path from 'node:path'
import { VOLUME_FIELDS } from '../../src/lookup/google.js'
import { pick } from '../../src/lookup/merge.js'
import { DOC_FIELDS, EDITION_FIELDS, SEARCH_EDITION_FIELDS, WORK_FIELDS } from '../../src/lookup/openLibrary.js'

export const fixturesDir = path.join(import.meta.dirname, '../fixtures/lookup')

// One file per upstream URL. The Google key is a query parameter and never reaches a file name.
export function fixtureName(url) {
  const { hostname, pathname, searchParams } = new URL(url)
  const isbn = (searchParams.get('q') ?? '').replace(/^isbn:/, '')
  if (hostname === 'openlibrary.org' && pathname === '/search.json') return `openlibrary/search-${isbn}.json`
  const record = /^\/(books|works)\/(OL\d+[MW])\.json$/.exec(pathname)
  if (hostname === 'openlibrary.org' && record) return `openlibrary/${record[1]}-${record[2]}.json`
  if (hostname === 'www.googleapis.com' && pathname === '/books/v1/volumes') return `google/volumes-${isbn}.json`
  return null
}

export function trimFixture(name, body) {
  if (name.startsWith('openlibrary/search-')) {
    return {
      numFound: body.numFound,
      docs: (body.docs ?? []).map((doc) => ({
        ...pick(doc, DOC_FIELDS),
        editions: { numFound: doc.editions?.numFound, docs: (doc.editions?.docs ?? []).map((e) => pick(e, SEARCH_EDITION_FIELDS)) },
      })),
    }
  }
  if (name.startsWith('openlibrary/books-')) return pick(body, ['type', ...EDITION_FIELDS])
  if (name.startsWith('openlibrary/works-')) return pick(body, ['type', ...WORK_FIELDS])
  return {
    kind: body.kind,
    totalItems: body.totalItems,
    items: (body.items ?? []).map((item) => ({ id: item.id, volumeInfo: pick(item.volumeInfo, VOLUME_FIELDS) })),
  }
}

export const readFixture = (name) => JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf8'))

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=UTF-8', ...headers } })

// Answers from the fixture files, 404 for a URL without one, unless `answer(url, init)` returns a
// Response first (or throws, as a network error does). Records every call with the clock's time.
export function fixtureFetch({ answer = () => undefined, now = () => 0 } = {}) {
  const calls = []
  async function fetch(url, init = {}) {
    calls.push({ url: String(url), init, at: now() })
    const special = await answer(String(url), init)
    if (special) return special
    const name = fixtureName(url)
    if (!name || !fs.existsSync(path.join(fixturesDir, name))) return json({ error: 'not found' }, 404)
    return json(readFixture(name))
  }
  return { fetch, calls }
}

// A clock whose sleep returns at once and moves time forward, for tests that need no real waiting.
export function instantClock(start = 0) {
  let time = start
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms
    },
    advance: (ms) => {
      time += ms
    },
  }
}
