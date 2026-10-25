/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { MemoryRouter } from 'react-router'
import Authors from '../src/pages/Authors/Authors.jsx'
import { stubEventSource } from './eventSource.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('Authors', () => {
  it('fetches the authors again when the library changes, and keeps them when that fetch fails', async () => {
    const { live } = stubEventSource()
    let answer = json([{ id: 1, name: 'Jane Austen', book_count: 1 }])
    const fetch = vi.fn(async () => answer.clone())
    vi.stubGlobal('fetch', fetch)
    render(<StrictMode><App><MemoryRouter><Authors /></MemoryRouter></App></StrictMode>)
    await screen.findByText('Jane Austen')

    answer = json([{ id: 2, name: 'Emily Brontë', book_count: 1 }, { id: 1, name: 'Jane Austen', book_count: 2 }])
    live()[0].emit('changed')
    await screen.findByText('Emily Brontë')
    expect(screen.getByText('2 authors')).not.toBeNull()

    const calls = fetch.mock.calls.length
    answer = json({ error: 'Bad gateway' }, 502)
    live()[0].emit('changed')
    await waitFor(() => expect(fetch.mock.calls.length).toBe(calls + 1))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText('Could not load the authors')).toBeNull()
    expect(screen.getByText('Emily Brontë')).not.toBeNull()
  })
})
