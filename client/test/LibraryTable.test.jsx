/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import LibraryTable from '../src/pages/Library/LibraryTable.jsx'

const BOOK = {
  id: 1, title: 'Emma', author: { id: 1, name: 'Jane Austen' }, cover_url: null, star_rating: 0, spice_rating: 0,
  gore_rating: 0, read: false, wishlist: false, created_at: '2023-01-01 03:00:00', editions: [{ id: 1, format: 'paperback' }],
}

const zone = process.env.TZ
afterEach(() => {
  if (zone === undefined) delete process.env.TZ
  else process.env.TZ = zone
})

describe('LibraryTable', () => {
  it('shows the date a book was added where the browser is', () => {
    process.env.TZ = 'America/New_York'
    render(<MemoryRouter><LibraryTable books={[BOOK]} linkTo={(id) => `/library/${id}`} onOpen={vi.fn()} onSave={vi.fn()} /></MemoryRouter>)
    expect(document.querySelector('td.col-added').textContent).toBe('2022-12-31')
  })
})
