/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { errorMessage, noteStatus } from './request.js'

async function failure(url, response, fallback) {
  noteStatus(url, response.status)
  const error = new Error(await errorMessage(response, fallback))
  error.status = response.status
  return error
}

// Resolves to { record, sources }: record is null when no source knows the ISBN (404), and sources
// then says whether Claude may be asked (sources.anthropic === 'available'). Any other failure
// rejects with the server's message and the HTTP status.
export async function lookupIsbn(isbn) {
  const url = `/api/lookup/${encodeURIComponent(isbn)}`
  const response = await fetch(url)
  if (response.status === 404) {
    const body = await response.json().catch(() => null)
    return { record: null, sources: body?.sources ?? {} }
  }
  if (!response.ok) throw await failure(url, response, 'The lookup failed')
  const record = await response.json()
  return { record, sources: record.sources ?? {} }
}

// Asks Claude to find the ISBN on the web. Resolves to the record, or to null when Claude found no
// listing (404); any other failure rejects as lookupIsbn does.
export async function identifyIsbn(isbn) {
  const url = `/api/lookup/${encodeURIComponent(isbn)}/identify`
  const response = await fetch(url, { method: 'POST' })
  if (response.status === 404) return null
  if (!response.ok) throw await failure(url, response, 'The Claude lookup failed')
  return response.json()
}
