/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
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

  it('reverts a failed rating while a save of another field is still pending', async () => {
    const patches = fakeServer()
    const { result } = renderHook(() => useLibrary('', undefined), { wrapper })
    await waitFor(() => expect(result.current.books).toHaveLength(1))

    act(() => { result.current.save(result.current.books[0], { star_rating: 4 }) })
    act(() => { result.current.save(result.current.books[0], { read: true }) })
    await act(async () => patches[0].resolve(json({ error: 'Server restarting' }, 500)))
    expect(result.current.books[0].star_rating).toBe(0)
    expect(result.current.books[0].read).toBe(true)
    await screen.findByText('Not saved: Server restarting')

    await act(async () => patches[1].resolve(json({ ...BOOK, read: true })))
    expect(result.current.books[0]).toMatchObject({ star_rating: 0, read: true })
  })

  it('keeps a pending rating when a save of another field answers first', async () => {
    const patches = fakeServer()
    const { result } = renderHook(() => useLibrary('', undefined), { wrapper })
    await waitFor(() => expect(result.current.books).toHaveLength(1))

    act(() => { result.current.save(result.current.books[0], { star_rating: 4 }) })
    act(() => { result.current.save(result.current.books[0], { read: true }) })
    // The server has not stored the rating yet when it answers the read toggle.
    await act(async () => patches[1].resolve(json({ ...BOOK, read: true })))
    expect(result.current.books[0]).toMatchObject({ star_rating: 4, read: true })

    await act(async () => patches[0].resolve(json({ ...BOOK, star_rating: 4, read: true })))
    expect(result.current.books[0]).toMatchObject({ star_rating: 4, read: true })
  })

  it('reverts to the stored value when two saves of one rating both fail', async () => {
    const patches = fakeServer()
    const { result } = renderHook(() => useLibrary('', undefined), { wrapper })
    await waitFor(() => expect(result.current.books).toHaveLength(1))

    act(() => { result.current.save(result.current.books[0], { star_rating: 3 }) })
    act(() => { result.current.save(result.current.books[0], { star_rating: 5 }) })
    await act(async () => patches[0].resolve(json({ error: 'Offline' }, 502)))
    expect(result.current.books[0].star_rating).toBe(5)
    await act(async () => patches[1].resolve(json({ error: 'Offline' }, 502)))
    expect(result.current.books[0].star_rating).toBe(0)
  })

  it('shows an earlier save that succeeds after the newest one failed', async () => {
    const patches = fakeServer()
    const { result } = renderHook(() => useLibrary('', undefined), { wrapper })
    await waitFor(() => expect(result.current.books).toHaveLength(1))

    act(() => { result.current.save(result.current.books[0], { star_rating: 3 }) })
    act(() => { result.current.save(result.current.books[0], { star_rating: 5 }) })
    await act(async () => patches[1].resolve(json({ error: 'Offline' }, 502)))
    expect(result.current.books[0].star_rating).toBe(0)
    await act(async () => patches[0].resolve(json({ ...BOOK, star_rating: 3 })))
    expect(result.current.books[0].star_rating).toBe(3)
  })
})
