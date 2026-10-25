/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from 'antd'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import CoverFlow from '../src/pages/Library/CoverFlow.jsx'
import Library from '../src/pages/Library/Library.jsx'

const book = (id, title, extra = {}) => ({
  id, title, author: { id: 1, name: 'Jane Austen' }, cover_url: null, star_rating: 0, spice_rating: 0, gore_rating: 0,
  read: false, wishlist: false, created_at: '2023-01-01 00:00:00', editions: [{ id, format: 'paperback' }], ...extra,
})
const BOOKS = [book(1, 'Emma'), book(2, 'Mansfield Park', { wishlist: true }), book(3, 'Persuasion')]

const linkTo = (id) => `/library/${id}`
const mount = (books, onOpen = vi.fn()) => {
  const ui = (list) => (
    <StrictMode>
      <MemoryRouter>
        <CoverFlow books={list} linkTo={linkTo} onOpen={onOpen} />
      </MemoryRouter>
    </StrictMode>
  )
  const result = render(ui(books))
  return { ...result, onOpen, update: (list) => result.rerender(ui(list)) }
}

const stage = () => screen.getByRole('group', { name: 'Cover flow' })
const centreTitle = () => document.querySelector('.coverflow-title').textContent
const coverNodes = () => [...document.querySelectorAll('.coverflow-cover')]

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('CoverFlow', () => {
  it('centres the first book with its author, formats, wishlist mark and position', () => {
    mount(BOOKS)
    expect(centreTitle()).toBe('Emma')
    expect(document.querySelector('.coverflow-author').textContent).toBe('Jane Austen')
    expect(document.querySelector('.coverflow-position').textContent).toBe('1 of 3')
    fireEvent.keyDown(stage(), { key: 'ArrowRight' })
    expect(screen.getByText('On the wishlist')).toBeTruthy()
  })

  it('moves with the arrow keys, Home and End', () => {
    mount(BOOKS)
    fireEvent.keyDown(stage(), { key: 'ArrowRight' })
    expect(centreTitle()).toBe('Mansfield Park')
    fireEvent.keyDown(stage(), { key: 'End' })
    expect(centreTitle()).toBe('Persuasion')
    fireEvent.keyDown(stage(), { key: 'ArrowRight' })
    expect(centreTitle()).toBe('Persuasion')
    fireEvent.keyDown(stage(), { key: 'Home' })
    expect(centreTitle()).toBe('Emma')
  })

  it('opens the centre book with Enter or a click, and centres a side cover on a click', () => {
    const { onOpen } = mount(BOOKS)
    fireEvent.keyDown(stage(), { key: 'Enter' })
    expect(onOpen).toHaveBeenLastCalledWith(1)

    const side = coverNodes()[2]
    fireEvent.click(side)
    expect(centreTitle()).toBe('Persuasion')
    expect(onOpen).toHaveBeenCalledTimes(1)

    fireEvent.click(coverNodes()[2])
    expect(onOpen).toHaveBeenLastCalledWith(3)
  })

  it('keeps the centred book when the list changes, and clamps when it is gone', () => {
    const { update } = mount(BOOKS)
    fireEvent.keyDown(stage(), { key: 'End' })
    update([book(9, 'Lady Susan'), ...BOOKS])
    expect(centreTitle()).toBe('Persuasion')
    expect(document.querySelector('.coverflow-position').textContent).toBe('4 of 4')
    update(BOOKS.slice(0, 2))
    expect(centreTitle()).toBe('Mansfield Park')
  })

  it('keeps the first centred book through a re-sort before any move', () => {
    const { update } = mount(BOOKS)
    update([BOOKS[1], BOOKS[2], BOOKS[0]])
    expect(centreTitle()).toBe('Emma')
    expect(document.querySelector('.coverflow-position').textContent).toBe('3 of 3')
  })

  it('mounts only the covers near the centre', () => {
    mount(Array.from({ length: 2000 }, (_, i) => book(i + 1, `Book ${i + 1}`)))
    fireEvent.keyDown(stage(), { key: 'End' })
    expect(centreTitle()).toBe('Book 2000')
    expect(coverNodes().length).toBeLessThanOrEqual(17)
  })
})

describe('the library view toggle', () => {
  const Probe = () => <output data-testid="location">{useLocation().search}</output>
  const renderLibrary = (entry) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(BOOKS), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    render(
      <StrictMode>
        <App>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/library/:id?" element={<><Library /><Probe /></>} />
            </Routes>
          </MemoryRouter>
        </App>
      </StrictMode>,
    )
  }

  it('writes ?view=flow, shows the flow and remembers the choice', async () => {
    renderLibrary('/library?format=paperback')
    await screen.findAllByText('Mansfield Park')
    expect(document.querySelector('.coverflow')).toBeNull()

    fireEvent.click(screen.getByText('Flow'))
    expect(screen.getByTestId('location').textContent).toBe('?format=paperback&view=flow')
    expect(document.querySelector('.coverflow')).not.toBeNull()
    expect(window.localStorage.getItem('hemlock.library.view')).toBe('flow')

    fireEvent.click(screen.getByText('List'))
    expect(screen.getByTestId('location').textContent).toBe('?format=paperback')
    expect(document.querySelector('.coverflow')).toBeNull()
  })

  it('shows the remembered view for an address without one, and the address wins over it', async () => {
    window.localStorage.setItem('hemlock.library.view', 'flow')
    renderLibrary('/library')
    await screen.findAllByText('Emma')
    expect(document.querySelector('.coverflow')).not.toBeNull()
    cleanup()

    renderLibrary('/library?view=list')
    await screen.findAllByText('Emma')
    expect(document.querySelector('.coverflow')).toBeNull()
  })
})
