/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import EditionForm from '../src/pages/Library/EditionForm.jsx'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const RECORD = {
  isbn: '9780553212587', title: 'Wuthering Heights', authors: ['Emily Brontë'], publisher: 'Bantam', published: '1983',
  synopsis: null, format: 'paperback', cover_url: 'https://covers.openlibrary.org/b/id/1-L.jpg',
  sources: { google: 'ok', open_library: 'ok', fields: {} },
}

const mount = () => render(
  <StrictMode>
    <App>
      <EditionForm mode="purchase" edition={null} onSubmit={vi.fn()} onCancel={vi.fn()} />
    </App>
  </StrictMode>,
)

async function lookUp(isbn) {
  fireEvent.change(screen.getByLabelText('ISBN'), { target: { value: isbn } })
  fireEvent.click(screen.getByRole('button', { name: /Look up/ }))
  await screen.findByText(new RegExp(`Found “|No book source knows ${isbn}`))
}

afterEach(() => vi.unstubAllGlobals())

describe('EditionForm', () => {
  it('credits the sources once a lookup fills the form, and drops the lookup when the next ISBN is unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (url.endsWith(RECORD.isbn) ? json(RECORD) : json({ error: 'Unknown' }, 404))))
    mount()
    expect(screen.queryByText(/Book data from/)).toBeNull()

    await lookUp(RECORD.isbn)
    await waitFor(() => expect(screen.getByLabelText('Publisher').value).toBe('Bantam'))
    expect(screen.getByText('Book data from Open Library and Google Books')).toBeTruthy()
    expect(screen.getByAltText('The cover the lookup found')).toBeTruthy()

    await lookUp('9780345803481')
    expect(screen.getByLabelText('Publisher').value).toBe('')
    expect(screen.queryByAltText('The cover the lookup found')).toBeNull()
    expect(screen.queryByText(/Book data from/)).toBeNull()
  })
})
