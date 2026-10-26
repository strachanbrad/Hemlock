/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.status = status
    this.body = body
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    // nginx answers 413 and 502 with an HTML body.
    return null
  }
}

// A 401 is these routes' own answer; from any other request it means the session has ended.
const answersSignIn = (url) => url === '/api/login' || url === '/api/session' || url.startsWith('/api/admin/')
let signedOut = null

// The shell's handler, called once for the first 401 after it is set, so a burst of failing
// requests sends the visitor to the login page once. Answers the function that removes it.
export function onSignedOut(handler) {
  signedOut = handler
  return () => {
    if (signedOut === handler) signedOut = null
  }
}

export function noteStatus(url, status) {
  if (status !== 401 || answersSignIn(url) || !signedOut) return
  const handler = signedOut
  signedOut = null
  handler()
}

export async function errorMessage(response, fallback) {
  const text = await response.text().catch(() => '')
  const error = parseJson(text)?.error
  return typeof error === 'string' && error ? error : `${fallback} (HTTP ${response.status})`
}

// A JSON body, or a multipart body of the JSON as a `data` part plus the `cover` file.
export function payloadBody(payload, cover) {
  if (!cover) return { json: payload }
  const form = new FormData()
  form.append('data', JSON.stringify(payload))
  form.append('cover', cover, cover.name || 'cover')
  return { form }
}

export async function request(url, { method = 'GET', json, form, signal } = {}) {
  const init = { method, signal }
  if (json !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(json)
  } else if (form) {
    init.body = form
  }

  const response = await fetch(url, init)
  if (!response.ok) {
    noteStatus(url, response.status)
    const body = parseJson(await response.text().catch(() => ''))
    let message = typeof body?.error === 'string' && body.error ? body.error : `The request failed (HTTP ${response.status})`
    if (response.status === 413 && !body) message = 'The cover is larger than 10 MB'
    throw new ApiError(message, response.status, body)
  }
  return response.status === 204 ? null : response.json()
}
