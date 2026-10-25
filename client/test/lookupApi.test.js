/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { lookupIsbn } from '../src/api/lookup.js'

afterEach(() => vi.restoreAllMocks())

const answer = (body, status, type = 'application/json') =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } }))

describe('lookupIsbn', () => {
  it('asks the server for the ISBN and returns the record', async () => {
    const fetch = answer({ isbn: '9780553212587', title: 'Wuthering Heights' }, 200)
    expect(await lookupIsbn('978-0-553-21258-7')).toEqual({ isbn: '9780553212587', title: 'Wuthering Heights' })
    expect(fetch).toHaveBeenCalledWith('/api/lookup/978-0-553-21258-7')
  })

  it('returns null when no source knows the ISBN', async () => {
    answer({ error: 'No book source knows ISBN 9781501120688' }, 404)
    expect(await lookupIsbn('9781501120688')).toBeNull()
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
