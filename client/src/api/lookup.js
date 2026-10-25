/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { errorMessage } from './request.js'

// Resolves to the lookup record, or to null when no source knows the ISBN (404).
// Any other failure rejects with the server's message and the HTTP status.
export async function lookupIsbn(isbn) {
  const response = await fetch(`/api/lookup/${encodeURIComponent(isbn)}`)
  if (response.status === 404) return null
  if (!response.ok) {
    const error = new Error(await errorMessage(response, 'The lookup failed'))
    error.status = response.status
    throw error
  }
  return response.json()
}
