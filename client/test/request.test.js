/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBook, deleteBook } from '../src/api/books.js'
import { ApiError } from '../src/api/request.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const html = (status) => new Response('<html><body><h1>nginx</h1></body></html>', { status, headers: { 'Content-Type': 'text/html' } })

function answer(response) {
  const fetch = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => vi.unstubAllGlobals())

describe('request', () => {
  it('hands a title conflict body to the caller', async () => {
    const body = { error: '"wuthering HEIGHTS" by Emily Brontë is already in the library', conflict: { book_id: 1 } }
    answer(json(body, 409))
    const failure = createBook({ title: 'wuthering HEIGHTS', author_name: 'emily brontë' })
    await expect(failure).rejects.toBeInstanceOf(ApiError)
    await expect(failure).rejects.toMatchObject({ status: 409, message: body.error, body })
  })

  it('hands an ISBN conflict body, with the edition, to the caller', async () => {
    const body = { error: 'ISBN 9780553212587 is already in the library', conflict: { book_id: 1, edition_id: 1 } }
    answer(json(body, 409))
    await expect(createBook({ title: 'Another' })).rejects.toMatchObject({ status: 409, body: { conflict: { book_id: 1, edition_id: 1 } } })
  })

  it('resolves an empty 204 to null', async () => {
    answer(new Response(null, { status: 204 }))
    await expect(deleteBook(1)).resolves.toBeNull()
  })

  it('names the size limit for nginx’s HTML 413 and the status for its 502', async () => {
    answer(html(413))
    await expect(createBook({ title: 'Big' })).rejects.toMatchObject({ status: 413, message: 'The cover is larger than 10 MB', body: null })
    answer(html(502))
    await expect(createBook({ title: 'Down' })).rejects.toMatchObject({ status: 502, message: 'The request failed (HTTP 502)' })
  })

  it('sends a cover as a multipart body of the JSON data part and the cover file', async () => {
    const fetch = answer(json({ id: 1 }, 201))
    const payload = { title: 'Emma', author_name: 'Jane Austen' }
    const cover = new File(['jpeg bytes'], 'cover.jpg', { type: 'image/jpeg' })
    await createBook(payload, cover)

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/books')
    expect(init.method).toBe('POST')
    expect(init.headers).toBeUndefined()
    expect(init.body).toBeInstanceOf(FormData)
    expect([...init.body.keys()]).toEqual(['data', 'cover'])
    expect(init.body.get('data')).toBe(JSON.stringify(payload))
    expect(init.body.get('cover').name).toBe('cover.jpg')
  })

  it('sends a payload without a cover as JSON', async () => {
    const fetch = answer(json({ id: 1 }, 201))
    await createBook({ title: 'Emma' })
    const [, init] = fetch.mock.calls[0]
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe('{"title":"Emma"}')
  })
})
