/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { identifyIsbn, lookupIsbn } from '../src/api/lookup.js'

afterEach(() => vi.restoreAllMocks())

const answer = (body, status, type = 'application/json') =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } }))

describe('lookupIsbn', () => {
  it('asks the server for the ISBN and returns the record with its sources', async () => {
    const record = { isbn: '9780553212587', title: 'Wuthering Heights', sources: { open_library: 'ok', anthropic: 'disabled' } }
    const fetch = answer(record, 200)
    expect(await lookupIsbn('978-0-553-21258-7')).toEqual({ record, sources: record.sources })
    expect(fetch).toHaveBeenCalledWith('/api/lookup/978-0-553-21258-7')
  })

  it('returns no record and the sources when no source knows the ISBN', async () => {
    const sources = { google: 'disabled', open_library: 'not_found', anthropic: 'available' }
    answer({ error: 'No book source knows ISBN 9781501120688', sources }, 404)
    expect(await lookupIsbn('9781501120688')).toEqual({ record: null, sources })
  })

  it('reads an HTML 404 as a miss without sources', async () => {
    answer('<html><body>404 Not Found</body></html>', 404, 'text/html')
    expect(await lookupIsbn('9781501120688')).toEqual({ record: null, sources: {} })
  })

  it("rejects with the server's message and status", async () => {
    answer({ error: 'Not a valid ISBN-10 or ISBN-13' }, 400)
    await expect(lookupIsbn('123')).rejects.toMatchObject({ message: 'Not a valid ISBN-10 or ISBN-13', status: 400 })
  })

  it("survives nginx's HTML 502", async () => {
    answer('<html><body>502 Bad Gateway</body></html>', 502, 'text/html')
    await expect(lookupIsbn('9780553212587')).rejects.toMatchObject({ message: 'The lookup failed (HTTP 502)', status: 502 })
  })
})

describe('identifyIsbn', () => {
  it('posts to the identify endpoint and returns the record', async () => {
    const record = { isbn: '9781969253096', title: 'The Poison Garden', sources: { anthropic: 'ok', fields: {} } }
    const fetch = answer(record, 200)
    expect(await identifyIsbn('9781969253096')).toEqual(record)
    expect(fetch).toHaveBeenCalledWith('/api/lookup/9781969253096/identify', { method: 'POST' })
  })

  it('returns null when Claude found no listing', async () => {
    answer({ error: 'Claude found no listing that shows ISBN 9781969253096' }, 404)
    expect(await identifyIsbn('9781969253096')).toBeNull()
  })

  it("rejects with the server's message on 502 and 503, and survives an HTML 504", async () => {
    answer({ error: 'The Claude lookup failed: Anthropic answered HTTP 529: Overloaded' }, 502)
    await expect(identifyIsbn('9781969253096')).rejects.toMatchObject({ message: 'The Claude lookup failed: Anthropic answered HTTP 529: Overloaded', status: 502 })
    vi.restoreAllMocks()
    answer({ error: 'Claude is not configured' }, 503)
    await expect(identifyIsbn('9781969253096')).rejects.toMatchObject({ message: 'Claude is not configured', status: 503 })
    vi.restoreAllMocks()
    answer('<html><body>504 Gateway Time-out</body></html>', 504, 'text/html')
    await expect(identifyIsbn('9781969253096')).rejects.toMatchObject({ message: 'The Claude lookup failed (HTTP 504)', status: 504 })
  })
})
