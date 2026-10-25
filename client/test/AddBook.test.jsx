/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router'
import AddBook from '../src/pages/AddBook/AddBook.jsx'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const AUTHORS = [{ id: 1, name: 'Emily Brontë', book_count: 1 }]
const WUTHERING = {
  isbn: '9780553212587', title: 'Wuthering Heights', authors: ['Emily Brontë'], publisher: 'Bantam', published: '1983',
  synopsis: 'A tale of the moors.', format: 'paperback', cover_url: 'https://covers.openlibrary.org/b/id/1-L.jpg',
  sources: { google: 'disabled', open_library: 'ok', fields: {} },
}
const SPARSE = {
  isbn: '9798322853480', title: 'Agnes Grey', authors: ['Anne Brontë'], publisher: null, published: null,
  synopsis: null, format: null, cover_url: null, sources: { google: 'disabled', open_library: 'ok', fields: {} },
}
const TITLE_CONFLICT = { error: '"Wuthering Heights" by Emily Brontë is already in the library', conflict: { book_id: 1 } }
const ISBN_CONFLICT = { error: 'ISBN 9780553212587 is already in the library', conflict: { book_id: 1, edition_id: 1 } }

function fakeServer({ lookups = {}, create = () => json({}, 201) } = {}) {
  const posts = []
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    if (url === '/api/authors') return json(AUTHORS)
    if (url.startsWith('/api/lookup/')) {
      const record = lookups[url.slice('/api/lookup/'.length)]
      return record ? json(record) : json({ error: 'No book source knows it' }, 404)
    }
    if (url === '/api/books' && init.method === 'POST') {
      posts.push(JSON.parse(init.body))
      return create()
    }
    return json({ error: 'Not found' }, 404)
  }))
  return posts
}

const mount = () => render(
  <StrictMode>
    <App>
      <MemoryRouter initialEntries={['/add']}>
        <Routes>
          <Route path="/add" element={<AddBook />} />
          <Route path="/library/:id" element={<p>Book page</p>} />
        </Routes>
      </MemoryRouter>
    </App>
  </StrictMode>,
)

const field = (label) => screen.getByLabelText(label)
const synopsis = () => screen.getByRole('textbox', { name: 'Synopsis' })

async function lookUp(isbn, found) {
  fireEvent.change(field('ISBN'), { target: { value: isbn } })
  // The loading icon of the previous lookup can still be leaving, which adds "loading" to the name.
  fireEvent.click(screen.getByRole('button', { name: /Look up/ }))
  if (found) await waitFor(() => expect(field('Title').value).toBe(found))
  else await screen.findByText(/fill in the details by hand/)
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete Element.prototype.scrollIntoView
})

describe('AddBook', () => {
  it('brings a title conflict into view and offers to add the copy as an edition', async () => {
    const posts = fakeServer({ lookups: { 9780553212587: WUTHERING }, create: () => json(TITLE_CONFLICT, 409) })
    mount()
    await lookUp('9780553212587', 'Wuthering Heights')
    fireEvent.click(screen.getByRole('button', { name: 'Add book' }))

    await screen.findByRole('button', { name: 'Add this as an edition' })
    expect(posts).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Open the existing book' }).getAttribute('href')).toBe('/library/1')
    expect(screen.getAllByText(TITLE_CONFLICT.error).length).toBeGreaterThanOrEqual(2)
    const scrolled = Element.prototype.scrollIntoView.mock.contexts
    expect(scrolled.some((node) => node.classList.contains('add-book-conflict'))).toBe(true)
  })

  it('links an ISBN conflict to the owning book without offering a second edition', async () => {
    fakeServer({ lookups: { 9780553212587: WUTHERING }, create: () => json(ISBN_CONFLICT, 409) })
    mount()
    await lookUp('9780553212587', 'Wuthering Heights')
    fireEvent.click(screen.getByRole('button', { name: 'Add book' }))

    await screen.findByRole('link', { name: 'Open the existing book' })
    expect(screen.queryByRole('button', { name: 'Add this as an edition' })).toBeNull()
  })

  it('drops the previous book’s details and cover when the next ISBN is unknown', async () => {
    fakeServer({ lookups: { 9780553212587: WUTHERING } })
    mount()
    await lookUp('9780553212587', 'Wuthering Heights')
    expect(screen.getByAltText('The cover the lookup found')).toBeTruthy()
    expect(field('Publisher').value).toBe('Bantam')

    await lookUp('9780345803481', null)
    expect(field('Title').value).toBe('')
    expect(synopsis().value).toBe('')
    expect(field('Publisher').value).toBe('')
    expect(field('Published').value).toBe('')
    expect(screen.queryByAltText('The cover the lookup found')).toBeNull()
  })

  it('clears what a sparser second answer leaves out', async () => {
    fakeServer({ lookups: { 9780553212587: WUTHERING, 9798322853480: SPARSE } })
    mount()
    await lookUp('9780553212587', 'Wuthering Heights')
    await lookUp('9798322853480', 'Agnes Grey')
    expect(synopsis().value).toBe('')
    expect(field('Publisher').value).toBe('')
    expect(screen.queryByAltText('The cover the lookup found')).toBeNull()
  })

  it('keeps a field the person changed after the lookup', async () => {
    fakeServer({ lookups: { 9780553212587: WUTHERING } })
    mount()
    await lookUp('9780553212587', 'Wuthering Heights')
    fireEvent.change(synopsis(), { target: { value: 'My own notes.' } })

    await lookUp('9780345803481', null)
    expect(synopsis().value).toBe('My own notes.')
    expect(field('Title').value).toBe('')
  })
})
