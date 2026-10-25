/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import BookCarousel from '../src/pages/Carousel/BookCarousel.jsx'

afterEach(() => vi.restoreAllMocks())

describe('BookCarousel', () => {
  it('removes every fullscreenchange listener it adds, under StrictMode', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: [] })))
    const added = vi.spyOn(document, 'addEventListener')
    const removed = vi.spyOn(document, 'removeEventListener')
    const count = (spy) => spy.mock.calls.filter(([type]) => type === 'fullscreenchange').length

    const { unmount } = render(<StrictMode><BookCarousel /></StrictMode>)
    await act(async () => {})
    unmount()

    expect(count(added)).toBeGreaterThan(0)
    expect(count(removed)).toBe(count(added))
  })
})
