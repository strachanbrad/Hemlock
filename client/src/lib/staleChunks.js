/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

const KEY = 'hemlock:stale-chunk-reload'
export const RELOAD_GAP_MS = 60_000

// A tab opened before a redeploy asks for lazy chunks the new build no longer has; one reload
// picks the new build up. A failure within RELOAD_GAP_MS of that reload, or without session
// storage to remember it, is left to surface, so a chunk that is really missing cannot loop.
export function reloadOnStaleChunk({ target = window, storage = window.sessionStorage, reload = () => window.location.reload(), now = Date.now } = {}) {
  const listener = (event) => {
    try {
      if (now() - (Number(storage.getItem(KEY)) || 0) < RELOAD_GAP_MS) return
      storage.setItem(KEY, String(now()))
    } catch {
      return
    }
    event.preventDefault()
    reload()
  }
  target.addEventListener('vite:preloadError', listener)
  return () => target.removeEventListener('vite:preloadError', listener)
}
