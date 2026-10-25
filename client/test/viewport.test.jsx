/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { PHONE_QUERY, useIsPhone } from '../src/lib/viewport.js'

function fakeMatchMedia(initial) {
  const listeners = new Set()
  const state = { matches: initial }
  const matchMedia = vi.fn((query) => ({
    media: query,
    get matches() { return state.matches },
    addEventListener: (type, listener) => listeners.add(listener),
    removeEventListener: (type, listener) => listeners.delete(listener),
  }))
  return {
    matchMedia,
    listeners,
    set(matches) {
      state.matches = matches
      for (const listener of [...listeners]) listener({ matches })
    },
  }
}

const Probe = () => <span>{useIsPhone() ? 'phone' : 'desktop'}</span>

afterEach(() => vi.unstubAllGlobals())

describe('useIsPhone', () => {
  it('is right on the first render, from the phone query', () => {
    const media = fakeMatchMedia(true)
    vi.stubGlobal('matchMedia', media.matchMedia)
    render(<Probe />)
    expect(screen.getByText('phone')).toBeTruthy()
    expect(media.matchMedia).toHaveBeenCalledWith(PHONE_QUERY)
    expect(PHONE_QUERY).toBe('(max-width: 767.98px)')
  })

  it('follows the viewport across the breakpoint and unsubscribes on unmount', () => {
    const media = fakeMatchMedia(false)
    vi.stubGlobal('matchMedia', media.matchMedia)
    const { unmount } = render(<StrictMode><Probe /></StrictMode>)
    expect(screen.getByText('desktop')).toBeTruthy()
    act(() => media.set(true))
    expect(screen.getByText('phone')).toBeTruthy()
    act(() => media.set(false))
    expect(screen.getByText('desktop')).toBeTruthy()
    unmount()
    expect(media.listeners.size).toBe(0)
  })
})
