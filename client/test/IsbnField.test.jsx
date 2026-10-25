/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import IsbnField from '../src/components/IsbnField.jsx'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function Harness({ onLookup, mounted = true }) {
  const [value, setValue] = useState('')
  return <StrictMode><App>{mounted && <IsbnField value={value} onChange={setValue} onLookup={onLookup} />}</App></StrictMode>
}

const MISS = { error: 'No book source knows ISBN 9781969253096', sources: { google: 'disabled', open_library: 'not_found', anthropic: 'available' } }
const CLAUDE = {
  isbn: '9781969253096', title: 'The Poison Garden', authors: ['Iris Vane'], publisher: null, published: null, synopsis: null,
  format: 'paperback', cover_url: null, source_url: 'https://www.amazon.com/dp/1969253096', sources: { anthropic: 'ok', fields: { title: 'anthropic' } },
}

// Answers the catalogue lookup with `lookup` and the identify call with whatever `identify()` resolves.
function claudeServer({ lookup = () => json(MISS, 404), identify }) {
  const fetch = vi.fn(async (url, init = {}) => (url.endsWith('/identify') && init.method === 'POST' ? identify(url) : lookup(url)))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const deferred = () => {
  let resolve
  const promise = new Promise((done) => (resolve = done))
  return { promise, resolve }
}

const typeAndLookUp = (isbn) => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: isbn } })
  fireEvent.click(screen.getByRole('button', { name: /Look up/ }))
}

afterEach(() => vi.unstubAllGlobals())

describe('IsbnField', () => {
  it('looks a typed ISBN up as ISBN-13 and hands the record over', async () => {
    const record = { isbn: '9780553212587', title: 'Wuthering Heights', authors: ['Emily Brontë'], sources: {} }
    const fetch = vi.fn(async () => json(record))
    vi.stubGlobal('fetch', fetch)
    const onLookup = vi.fn()
    render(<Harness onLookup={onLookup} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '0-553-21258-3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }))
    await waitFor(() => expect(onLookup).toHaveBeenCalledWith(record, { scanned: false, isbn: '9780553212587' }))
    expect(fetch.mock.calls[0][0]).toBe('/api/lookup/9780553212587')
    expect(screen.getByText(/Found “Wuthering Heights” by Emily Brontë/)).toBeTruthy()
  })

  it('leaves the form for manual entry when no source knows the ISBN', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'No source knows that ISBN' }, 404)))
    const onLookup = vi.fn()
    render(<Harness onLookup={onLookup} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '9780553212587' } })
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }))
    await waitFor(() => expect(screen.getByText(/No book source knows 9780553212587/)).toBeTruthy())
    expect(onLookup).toHaveBeenCalledExactlyOnceWith(null, { scanned: false, isbn: '9780553212587' })
  })

  it('reports a failed lookup as nothing found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'No book source answered; try again later' }, 502)))
    const onLookup = vi.fn()
    render(<Harness onLookup={onLookup} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '9780553212587' } })
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }))
    await waitFor(() => expect(screen.getByText(/The lookup failed \(No book source answered/)).toBeTruthy())
    expect(onLookup).toHaveBeenCalledExactlyOnceWith(null, { scanned: false, isbn: '9780553212587' })
  })

  it('asks Claude after a miss when the server offers it, then hands over the record once', async () => {
    const answer = deferred()
    const fetch = claudeServer({ identify: () => answer.promise })
    const onLookup = vi.fn()
    render(<Harness onLookup={onLookup} />)
    typeAndLookUp('1969253096')
    await waitFor(() => expect(screen.getByText('Not in the catalogues. Asking Claude…')).toBeTruthy())
    expect(onLookup).not.toHaveBeenCalled()
    answer.resolve(json(CLAUDE))
    await waitFor(() => expect(screen.getByText('Found “The Poison Garden” by Iris Vane, via Claude from amazon.com.')).toBeTruthy())
    expect(onLookup).toHaveBeenCalledExactlyOnceWith(CLAUDE, { scanned: false, isbn: '9781969253096' })
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/lookup/9781969253096', '/api/lookup/9781969253096/identify'])
  })

  it('says no catalogue or search knows the ISBN when Claude finds nothing', async () => {
    claudeServer({ identify: () => json({ error: 'Claude found no listing that shows ISBN 9781969253096' }, 404) })
    const onLookup = vi.fn()
    render(<Harness onLookup={onLookup} />)
    typeAndLookUp('9781969253096')
    await waitFor(() => expect(screen.getByText('No catalogue or search knows 9781969253096; fill in the details by hand.')).toBeTruthy())
    expect(onLookup).toHaveBeenCalledExactlyOnceWith(null, { scanned: false, isbn: '9781969253096' })
  })

  it("shows Claude's failure and leaves the form for typing", async () => {
    claudeServer({ identify: () => json({ error: 'The Claude lookup failed: Anthropic answered HTTP 529: Overloaded' }, 502) })
    const onLookup = vi.fn()
    render(<Harness onLookup={onLookup} />)
    typeAndLookUp('9781969253096')
    await waitFor(() => expect(screen.getByText('The Claude lookup failed: Anthropic answered HTTP 529: Overloaded; fill in the details by hand.')).toBeTruthy())
    expect(onLookup).toHaveBeenCalledExactlyOnceWith(null, { scanned: false, isbn: '9781969253096' })
  })

  it('never asks Claude when the server does not offer it', async () => {
    const fetch = claudeServer({ lookup: () => json({ ...MISS, sources: { ...MISS.sources, anthropic: 'disabled' } }, 404), identify: () => json(CLAUDE) })
    render(<Harness onLookup={vi.fn()} />)
    typeAndLookUp('9781969253096')
    await waitFor(() => expect(screen.getByText(/No book source knows 9781969253096/)).toBeTruthy())
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("drops Claude's answer when a newer lookup starts", async () => {
    const slow = deferred()
    const record = { isbn: '9780553212587', title: 'Wuthering Heights', authors: ['Emily Brontë'], sources: {} }
    claudeServer({ lookup: (url) => (url.endsWith('9780553212587') ? json(record) : json(MISS, 404)), identify: () => slow.promise })
    const onLookup = vi.fn()
    render(<Harness onLookup={onLookup} />)
    typeAndLookUp('9781969253096')
    await waitFor(() => expect(screen.getByText(/Asking Claude/)).toBeTruthy())
    typeAndLookUp('9780553212587')
    await waitFor(() => expect(screen.getByText(/Found “Wuthering Heights”/)).toBeTruthy())
    slow.resolve(json(CLAUDE))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(onLookup).toHaveBeenCalledExactlyOnceWith(record, { scanned: false, isbn: '9780553212587' })
    expect(screen.queryByText(/Poison Garden/)).toBeNull()
  })

  it("drops Claude's answer when the field unmounts", async () => {
    const slow = deferred()
    claudeServer({ identify: () => slow.promise })
    const onLookup = vi.fn()
    const view = render(<Harness onLookup={onLookup} />)
    typeAndLookUp('9781969253096')
    await waitFor(() => expect(screen.getByText(/Asking Claude/)).toBeTruthy())
    view.rerender(<Harness onLookup={onLookup} mounted={false} />)
    slow.resolve(json(CLAUDE))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(onLookup).not.toHaveBeenCalled()
  })

  it('asks for a valid ISBN without calling the server', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render(<Harness onLookup={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '9780553212588' } })
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }))
    expect(screen.getByText(/Enter a valid ISBN/)).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })
})
