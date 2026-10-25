/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

const RECONNECT_MS = 5000

export const liveUpdatesSupported = () => typeof EventSource === 'function'

// onChange('changed') when the library changed; onChange('reconnected') when the stream opens again
// after a failure, since a change may have happened while it was down. Returns close().
export function watchChanges(onChange) {
  if (!liveUpdatesSupported()) return () => {}
  let source = null
  let fresh = true
  let timer = null

  const connect = () => {
    const current = new EventSource('/api/events')
    source = current
    current.addEventListener('open', () => {
      if (!fresh) onChange('reconnected')
      fresh = false
    })
    current.addEventListener('changed', () => onChange('changed'))
    // The browser retries a dropped stream by itself but gives up for good on a refused one (nginx's
    // 502 while the server restarts, the 503 cap), so a closed source is replaced after a pause.
    current.addEventListener('error', () => {
      fresh = false
      if (current.readyState === EventSource.CLOSED && source === current) timer = setTimeout(connect, RECONNECT_MS)
    })
  }

  connect()
  return () => {
    clearTimeout(timer)
    source?.close()
    source = null
  }
}
