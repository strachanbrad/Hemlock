/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSettings } from '../src/api/admin.js'
import { createBook, deleteBook, listBooks } from '../src/api/books.js'
import { lookupIsbn } from '../src/api/lookup.js'
import { ApiError, onSignedOut } from '../src/api/request.js'
import { login, session } from '../src/api/session.js'

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

describe('a 401', () => {
  const signIn = () => json({ error: 'Sign in' }, 401)

  it('calls the shell once for a burst of failing requests, and again only once it is set again', async () => {
    const handler = vi.fn()
    const stop = onSignedOut(handler)
    answer(signIn())
    await expect(listBooks()).rejects.toMatchObject({ status: 401, message: 'Sign in' })
    answer(signIn())
    await expect(deleteBook(1)).rejects.toMatchObject({ status: 401 })
    expect(handler).toHaveBeenCalledTimes(1)
    stop()

    const again = vi.fn()
    const stopAgain = onSignedOut(again)
    answer(signIn())
    await expect(lookupIsbn('9780553212587')).rejects.toMatchObject({ status: 401 })
    expect(again).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledTimes(1)
    stopAgain()
  })

  it('is the answer of the login, the session check and the admin routes, never an ended session', async () => {
    const handler = vi.fn()
    const stop = onSignedOut(handler)
    answer(json({ error: 'Wrong name or password' }, 401))
    await expect(login('Ana', 'wrong password')).rejects.toMatchObject({ status: 401, message: 'Wrong name or password' })
    answer(signIn())
    await expect(session()).resolves.toBeNull()
    answer(json({ error: 'Not signed in' }, 401))
    await expect(getSettings()).rejects.toMatchObject({ status: 401 })
    answer(json({ error: 'Not found' }, 404))
    await expect(listBooks()).rejects.toMatchObject({ status: 404 })
    expect(handler).not.toHaveBeenCalled()
    stop()
  })

  it('reaches no handler once it is removed', async () => {
    const handler = vi.fn()
    onSignedOut(handler)()
    answer(signIn())
    await expect(listBooks()).rejects.toMatchObject({ status: 401 })
    expect(handler).not.toHaveBeenCalled()
  })
})
