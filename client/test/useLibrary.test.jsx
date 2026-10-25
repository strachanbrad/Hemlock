/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { useLibrary } from '../src/pages/Library/useLibrary.js'
import { stubEventSource } from './eventSource.js'

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

  it('keeps a pending rating through a fetch after a change elsewhere, then shows what the server holds', async () => {
    const { live } = stubEventSource()
    let stored = BOOK
    const patches = []
    const fetch = vi.fn((url, init = {}) => {
      if (init.method === 'PATCH') return new Promise((resolve) => patches.push(resolve))
      return Promise.resolve(json(url === '/api/books/1' ? stored : [stored]))
    })
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useLibrary('', '1'), { wrapper })
    await waitFor(() => expect(result.current.openBookLoaded).toBe(true))
    const gets = (url) => fetch.mock.calls.filter(([u, init]) => u === url && init.method === 'GET').length
    const before = { list: gets('/api/books'), book: gets('/api/books/1') }

    act(() => { result.current.save(result.current.books[0], { star_rating: 4 }) })
    // Another page marked the book read; what the fetches answer predates the pending rating.
    stored = { ...BOOK, read: true }
    live()[0].emit('changed')
    await waitFor(() => expect(result.current.books[0].read).toBe(true))
    await waitFor(() => expect(result.current.openBook.read).toBe(true))
    expect({ list: gets('/api/books'), book: gets('/api/books/1') }).toEqual({ list: before.list + 1, book: before.book + 1 })
    expect(result.current.books[0].star_rating).toBe(4)
    expect(result.current.openBook.star_rating).toBe(4)

    await act(async () => patches[0](json({ ...BOOK, read: true, star_rating: 4 })))
    expect(result.current.books[0]).toMatchObject({ star_rating: 4, read: true })

    stored = { ...BOOK, read: true, star_rating: 2 }
    live()[0].emit('changed')
    await waitFor(() => expect(result.current.books[0].star_rating).toBe(2))
    await waitFor(() => expect(result.current.openBook.star_rating).toBe(2))
  })

  it('fetches the open book again after a change, and reports it gone once deleted elsewhere', async () => {
    const { live } = stubEventSource()
    let stored = { ...BOOK, synopsis: 'Old.' }
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url === '/api/books/1') return Promise.resolve(stored ? json(stored) : json({ error: 'Book not found' }, 404))
      return Promise.resolve(json(stored ? [stored] : []))
    }))
    const { result } = renderHook(() => useLibrary('', '1'), { wrapper })
    await waitFor(() => expect(result.current.openBook?.synopsis).toBe('Old.'))

    stored = { ...BOOK, synopsis: 'New.' }
    live()[0].emit('changed')
    await waitFor(() => expect(result.current.openBook.synopsis).toBe('New.'))

    stored = null
    live()[0].emit('changed')
    await waitFor(() => expect(result.current.openError).toBe('Book not found'))
    expect(result.current.openBook).toBeNull()
    expect(result.current.books).toEqual([])
  })

  it('keeps the list and the open book when a fetch after a change fails', async () => {
    const { live } = stubEventSource()
    let failing = false
    const fetch = vi.fn((url) => Promise.resolve(failing ? json({ error: 'Bad gateway' }, 502) : json(url === '/api/books/1' ? BOOK : [BOOK])))
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useLibrary('', '1'), { wrapper })
    await waitFor(() => expect(result.current.openBookLoaded).toBe(true))
    const calls = fetch.mock.calls.length

    failing = true
    live()[0].emit('changed')
    await waitFor(() => expect(fetch.mock.calls.length).toBe(calls + 2))
    await act(async () => {})
    expect(result.current.books).toHaveLength(1)
    expect(result.current.error).toBeNull()
    expect(result.current.openBook).toMatchObject({ id: 1, title: 'Emma' })
    expect(result.current.openBookLoaded).toBe(true)
    expect(result.current.openError).toBeNull()
  })
})
