/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

export const TIMEOUT_MS = 8000
const DEFAULT_PAUSE_MS = 60 * 1000
const MAX_PAUSE_MS = 60 * 60 * 1000

const FAILED = Object.freeze({ status: 'failed' })
const NOT_FOUND = Object.freeze({ status: 'not_found' })

function pauseAfter(response) {
  const seconds = Number(response.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_PAUSE_MS) : DEFAULT_PAUSE_MS
}

// Resolves to { status: 'ok', body } | { status: 'not_found' } | { status: 'failed' }; never rejects.
// One retry on a network error, a timeout or a 5xx; none on a 4xx. A 403 or 429 pauses the source,
// and while it is paused every request fails without being sent.
// `headers` is an object, or a function read at each request.
export function createJsonSource({ name, fetch, headers, schedule = (task) => task(), now, sleep, retryDelay = 0, timeoutMs = TIMEOUT_MS, log }) {
  const headersNow = typeof headers === 'function' ? headers : () => headers
  let pausedUntil = -Infinity

  async function attempt(url) {
    try {
      const response = await schedule(() => fetch(url, { headers: headersNow(), redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) }))
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        return { response }
      }
      return { response, body: await response.json() }
    } catch (error) {
      return { error }
    }
  }

  return async function getJson(url) {
    const where = `${name} ${new URL(url).pathname}`
    if (now() < pausedUntil) {
      log(`${where}: not sent, paused after a refusal`)
      return FAILED
    }

    for (let tries = 1; ; tries++) {
      const { response, body, error } = await attempt(url)
      const retryable = error || response.status >= 500
      if (retryable && tries < 2) {
        if (retryDelay > 0) await sleep(retryDelay)
        continue
      }
      if (error) {
        log(`${where}: ${error.name === 'TimeoutError' ? `no answer in ${timeoutMs} ms` : error.message}`)
        return FAILED
      }
      if (response.ok) return { status: 'ok', body }
      if (response.status === 404) return NOT_FOUND
      if (response.status >= 300 && response.status < 400) {
        log(`${where}: HTTP ${response.status}, redirect not followed`)
        return NOT_FOUND
      }
      if (response.status === 403 || response.status === 429) pausedUntil = now() + pauseAfter(response)
      log(`${where}: HTTP ${response.status}`)
      return FAILED
    }
  }
}
