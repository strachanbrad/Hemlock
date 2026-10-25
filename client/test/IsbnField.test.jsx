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

function Harness({ onLookup }) {
  const [value, setValue] = useState('')
  return <StrictMode><App><IsbnField value={value} onChange={setValue} onLookup={onLookup} /></App></StrictMode>
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
