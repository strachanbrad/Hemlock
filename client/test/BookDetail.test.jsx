/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { MemoryRouter } from 'react-router'
import BookDetail from '../src/pages/Library/BookDetail.jsx'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const BOOK = {
  id: 7, title: 'The Poison Garden', author: { id: 1, name: 'Iris Vane' },
  star_rating: 0, spice_rating: 0, gore_rating: 0, read: false, wishlist: false, created_at: '2026-10-25 09:00:00',
  cover_url: '/covers/e11-0000000a.jpg', synopsis: null,
  editions: [{ id: 11, format: 'paperback', isbn: '9781969253096', publisher: null, published: null, cover_url: '/covers/e11-0000000a.jpg' }],
}
const NEW_COVER = '/covers/e11-1234abcd.jpg'
const REPLACED = { ...BOOK, cover_url: NEW_COVER, editions: [{ ...BOOK.editions[0], cover_url: NEW_COVER }] }

function mount(book = BOOK) {
  const onReplace = vi.fn()
  render(
    <StrictMode>
      <App>
        <MemoryRouter>
          <BookDetail book={book} loaded initialMode={null} onSave={vi.fn()} onReplace={onReplace} onDeleted={vi.fn()} />
        </MemoryRouter>
      </App>
    </StrictMode>,
  )
  return { onReplace }
}

// The answer waits until the test releases it, so the busy state can be read.
function answerWith(response) {
  let release
  const fetch = vi.fn(() => new Promise((resolve) => (release = () => resolve(response))))
  vi.stubGlobal('fetch', fetch)
  return { fetch, release: () => release() }
}

// jsdom runs no CSS motion, so the spinner antd fades out stays in the button's name once loading ends.
const findButton = () => screen.getByRole('button', { name: /Find a better cover/ })

afterEach(() => vi.unstubAllGlobals())

describe('BookDetail Find a better cover', () => {
  it('asks once, shows the busy state, then reports the replaced cover with its host and size and shows the new record', async () => {
    const { fetch, release } = answerWith(json({ replaced: true, book: REPLACED, source: 'claude', source_url: 'https://www.amazon.com/dp/1969253096', width: 1200, height: 1800 }))
    const { onReplace } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Find a better cover' }))
    const busy = await screen.findByRole('button', { name: /Asking Claude…/ })
    expect(busy.className).toMatch(/ant-btn-loading/)
    fireEvent.click(busy)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('/api/books/7/cover/find')
    expect(fetch.mock.calls[0][1].method).toBe('POST')

    release()
    expect(await screen.findByText('Cover replaced, from amazon.com (1200 × 1800)')).toBeTruthy()
    expect(onReplace).toHaveBeenCalledWith(REPLACED)
    await waitFor(() => expect(findButton().className).not.toMatch(/ant-btn-loading/))
  })

  it('names the free source a cover came from', async () => {
    const { release } = answerWith(json({ replaced: true, book: REPLACED, source: 'barnes_noble', source_url: null, width: 876, height: 1356 }))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Find a better cover' }))
    release()
    expect(await screen.findByText('Cover replaced, from Barnes & Noble (876 × 1356)')).toBeTruthy()
  })

  it('says the current cover stays when nothing wider was found, for a book without editions too', async () => {
    const plain = { ...BOOK, cover_url: '/covers/b7-0000000b.jpg', editions: [] }
    const { release } = answerWith(json({ replaced: false, book: plain, source: 'claude', source_url: 'https://www.goodreads.com/book/show/1', width: 300, height: 450 }))
    const { onReplace } = mount(plain)
    expect(screen.getByRole('button', { name: 'Change cover' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Find a better cover' }))
    release()
    expect(await screen.findByText('The current cover is already the largest found')).toBeTruthy()
    expect(onReplace).toHaveBeenCalledWith(plain)
  })

  it("shows the server's message when the search cannot run, and keeps the book", async () => {
    const { release } = answerWith(json({ error: 'Claude is not configured' }, 503))
    const { onReplace } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Find a better cover' }))
    release()
    expect(await screen.findByText('Claude is not configured')).toBeTruthy()
    await waitFor(() => expect(findButton().className).not.toMatch(/ant-btn-loading/))
    expect(onReplace).not.toHaveBeenCalled()
  })
})
