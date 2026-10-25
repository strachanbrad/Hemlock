/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { RELOAD_GAP_MS, reloadOnStaleChunk } from '../src/lib/staleChunks.js'

const preloadError = () => {
  const event = new Event('vite:preloadError', { cancelable: true })
  window.dispatchEvent(event)
  return event
}

let stop = () => {}
afterEach(() => {
  stop()
  window.sessionStorage.clear()
})

describe('reloadOnStaleChunk', () => {
  it('reloads once for a chunk a redeploy removed, then lets a repeat surface', () => {
    let time = 1_000_000
    const reload = vi.fn()
    stop = reloadOnStaleChunk({ reload, now: () => time })

    expect(preloadError().defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)

    time += RELOAD_GAP_MS - 1
    expect(preloadError().defaultPrevented).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)

    time += 1
    expect(preloadError().defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload without storage to remember the reload', () => {
    const reload = vi.fn()
    const storage = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    stop = reloadOnStaleChunk({ reload, storage })
    expect(preloadError().defaultPrevented).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
