/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { useLibrary } from '../src/pages/Library/useLibrary.js'

const BOOK = { id: 1, title: 'Emma', author: { id: 1, name: 'Jane Austen' }, star_rating: 0, spice_rating: 0, gore_rating: 0, read: false, wishlist: false, editions: [] }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Each PATCH waits until the test settles it, so responses can arrive out of order.
function fakeServer() {
  const patches = []
  vi.stubGlobal('fetch', vi.fn((url, init = {}) => {
    if (init.method === 'PATCH') {
      return new Promise((resolve) => patches.push({ body: JSON.parse(init.body), resolve }))
    }
    return Promise.resolve(json([BOOK]))
  }))
  return patches
}

const wrapper = ({ children }) => <StrictMode><App>{children}</App></StrictMode>

afterEach(() => vi.unstubAllGlobals())

describe('useLibrary', () => {
  it('keeps the newest tap when an older save answers last', async () => {
    const patches = fakeServer()
    const { result } = renderHook(() => useLibrary('', undefined), { wrapper })
    await waitFor(() => expect(result.current.books).toHaveLength(1))

    act(() => { result.current.save(result.current.books[0], { star_rating: 3 }) })
    act(() => { result.current.save(result.current.books[0], { star_rating: 5 }) })
    expect(result.current.books[0].star_rating).toBe(5)

    await act(async () => patches[1].resolve(json({ ...BOOK, star_rating: 5 })))
    await act(async () => patches[0].resolve(json({ ...BOOK, star_rating: 3 })))
    expect(result.current.books[0].star_rating).toBe(5)
  })

  it('shows a change at once and reverts it when the save fails', async () => {
    const patches = fakeServer()
    const { result } = renderHook(() => useLibrary('', undefined), { wrapper })
    await waitFor(() => expect(result.current.books).toHaveLength(1))

    act(() => { result.current.save(result.current.books[0], { read: true }) })
    expect(result.current.books[0].read).toBe(true)
    await act(async () => patches[0].resolve(json({ error: 'Book not found' }, 404)))
    expect(result.current.books[0].read).toBe(false)
  })
})
