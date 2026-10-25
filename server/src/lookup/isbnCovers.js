/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { isbn13To10 } from '../lib/isbn.js'
import { TIMEOUT_MS } from './http.js'

// Cover images addressed by the ISBN alone, keyless, largest first: Barnes & Noble's (on its Shopify
// CDN) where it has one, then Amazon's and Open Library's at about 500 px. A source without a URL
// for an ISBN (Amazon for a 979 ISBN, which has no ISBN-10) gives null.
export const ISBN_COVERS = {
  barnes_noble: (isbn) => `https://cdn.shopify.com/s/files/1/0674/5433/7265/files/${isbn}_p0.jpg`,
  amazon: (isbn) => {
    const isbn10 = isbn13To10(isbn)
    return isbn10 ? `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg` : null
  },
  open_library: (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
}

// Amazon answers an ISBN it has no cover for with a 43-byte 1x1 GIF and status 200.
const MIN_BYTES = { barnes_noble: 0, amazon: 1000 }

async function probe(source, url, { fetch, timeoutMs, userAgent }) {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': userAgent } })
    await response.body?.cancel().catch(() => {})
    const image = (response.headers.get('content-type') ?? '').startsWith('image/')
    const big = MIN_BYTES[source] === 0 || Number(response.headers.get('content-length')) > MIN_BYTES[source]
    return { answered: true, url: response.status === 200 && image && big ? url : null }
  } catch {
    return { answered: false, url: null }
  }
}

// One HEAD request each to Barnes & Noble and Amazon. Resolves to { status: 'ok', barnes_noble, amazon },
// each the cover URL when that source has one, else null, and `partial` when a request went unanswered,
// so a cache asks again; never rejects.
export async function probeIsbnCovers(isbn, { fetch = globalThis.fetch, timeoutMs = TIMEOUT_MS, userAgent }) {
  const result = { status: 'ok' }
  await Promise.all(Object.keys(MIN_BYTES).map(async (source) => {
    const url = ISBN_COVERS[source](isbn)
    const { answered, url: hit } = url ? await probe(source, url, { fetch, timeoutMs, userAgent }) : { answered: true, url: null }
    result[source] = hit
    if (!answered) result.partial = true
  }))
  return result
}
