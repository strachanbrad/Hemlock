/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { JPEG, PNG, WEBP, loadApp, startServer } from './support/server.js'
import { client, coverFiles, emptyLibrary, multipart, placeCover } from './support/http.js'

let app
let api
let coversDir
before(async () => {
  app = await startServer()
  api = client(app.base)
  coversDir = (await loadApp()).coversDir
})
after(() => app.close())
beforeEach(() => emptyLibrary(app.db, coversDir))

// Persuasion is wishlisted and owned as an ebook with a cover; Emma is wishlisted and not owned.
function seed() {
  app.db.exec(`
    INSERT INTO authors (id, name) VALUES (1, 'Jane Austen');
    INSERT INTO books (id, title, author_id, wishlist) VALUES (1, 'Persuasion', 1, 1), (2, 'Emma', 1, 1);
    INSERT INTO editions (id, book_id, format, isbn, cover) VALUES
      (1, 1, 'ebook', NULL, 'e1-0000000a.png'),
      (2, 1, 'paperback', '9780141439686', 'e2-0000000b.jpg');
  `)
  placeCover(coversDir, 'e1-0000000a.png', PNG)
  placeCover(coversDir, 'e2-0000000b.jpg', JPEG)
}

describe('POST /api/books/:id/editions', () => {
  it('adds a physical edition, clears wishlist and answers 201 with the whole book', async () => {
    seed()
    const { status, body } = await api.post('/api/books/2/editions', { format: 'hardcover', isbn: '978 0 14 143958 7', published: '2003-05' })
    assert.equal(status, 201)
    assert.equal(body.id, 2)
    assert.equal(body.wishlist, false)
    assert.deepEqual(body.editions.map(({ format, isbn, published }) => ({ format, isbn, published })), [
      { format: 'hardcover', isbn: '9780141439587', published: '2003-05' },
    ])
    assert.equal(typeof body.synopsis, 'string')
  })

  it('adds an ebook edition without clearing wishlist', async () => {
    seed()
    const { status, body } = await api.post('/api/books/2/editions', { format: 'ebook', isbn: null })
    assert.equal(status, 201)
    assert.equal(body.wishlist, true)
  })

  it('saves the cover as e<edition id> with the sniffed extension', async () => {
    seed()
    const { status, body } = await api.post('/api/books/2/editions', multipart({ format: 'paperback' }, WEBP, { type: 'image/png', filename: 'c.png' }))
    assert.equal(status, 201)
    const edition = body.editions[0]
    assert.match(edition.cover_url, new RegExp(`^/covers/e${edition.id}-[0-9a-f]{8}\\.webp$`))
    assert.ok(coverFiles(coversDir).includes(path.basename(edition.cover_url)))
  })

  it('answers 409 with the owning book for an ISBN in the library, and keeps no file', async () => {
    seed()
    const { status, body } = await api.post('/api/books/2/editions', multipart({ format: 'paperback', isbn: '0141439688' }, JPEG))
    assert.deepEqual({ status, body }, {
      status: 409,
      body: { error: 'ISBN 9780141439686 is already in the library', conflict: { book_id: 1, edition_id: 2 } },
    })
    assert.deepEqual(coverFiles(coversDir), ['e1-0000000a.png', 'e2-0000000b.jpg'])
  })

  it('answers 409 for a second edition of one format without an ISBN', async () => {
    seed()
    const { status, body } = await api.post('/api/books/1/editions', { format: 'ebook' })
    assert.deepEqual({ status, body }, {
      status: 409,
      body: { error: 'This book already has an ebook edition without an ISBN', conflict: { book_id: 1, edition_id: 1 } },
    })
  })

  it('answers 404 for an unknown book and 400 without a format', async () => {
    seed()
    assert.deepEqual(await api.post('/api/books/99/editions', { format: 'ebook' }), { status: 404, body: { error: 'Book not found' } })
    assert.deepEqual(await api.post('/api/books/2/editions', { isbn: '9780141439587' }), { status: 400, body: { error: 'format is required' } })
  })
})

describe('PATCH /api/editions/:id', () => {
  it('changes the sent fields and answers the whole book', async () => {
    seed()
    const { status, body } = await api.patch('/api/editions/2', { publisher: ' Penguin   Classics ', published: '2003' })
    assert.equal(status, 200)
    assert.equal(body.id, 1)
    const edition = body.editions.find((e) => e.id === 2)
    assert.deepEqual([edition.publisher, edition.published, edition.isbn], ['Penguin Classics', '2003', '9780141439686'])
  })

  it('replaces the cover with a new file name and deletes the old file after the commit', async () => {
    seed()
    const { status, body } = await api.patch('/api/editions/2', multipart({}, PNG))
    assert.equal(status, 200)
    const cover = body.editions.find((e) => e.id === 2).cover_url
    assert.match(cover, /^\/covers\/e2-[0-9a-f]{8}\.png$/)
    assert.deepEqual(coverFiles(coversDir), ['e1-0000000a.png', path.basename(cover)])
    assert.equal(body.cover_url, cover)
  })

  it('removes the cover for cover: null', async () => {
    seed()
    const { body } = await api.patch('/api/editions/2', { cover: null })
    assert.equal(body.editions.find((e) => e.id === 2).cover_url, null)
    assert.equal(body.cover_url, '/covers/e1-0000000a.png')
    assert.deepEqual(coverFiles(coversDir), ['e1-0000000a.png'])
  })

  it('keeps the old cover and writes no file when the change is refused', async () => {
    seed()
    app.db.exec("INSERT INTO editions (id, book_id, format, isbn) VALUES (3, 2, 'hardcover', '9780141439587')")
    const { status, body } = await api.patch('/api/editions/2', multipart({ isbn: '9780141439587' }, PNG))
    assert.deepEqual({ status, body }, {
      status: 409,
      body: { error: 'ISBN 9780141439587 is already in the library', conflict: { book_id: 2, edition_id: 3 } },
    })
    assert.deepEqual(coverFiles(coversDir), ['e1-0000000a.png', 'e2-0000000b.jpg'])
  })

  it('checks a format change against the editions without an ISBN', async () => {
    seed()
    const { status, body } = await api.patch('/api/editions/2', { format: 'ebook', isbn: '' })
    assert.deepEqual({ status, body }, {
      status: 409,
      body: { error: 'This book already has an ebook edition without an ISBN', conflict: { book_id: 1, edition_id: 1 } },
    })
    assert.equal((await api.patch('/api/editions/1', { format: 'ebook' })).status, 200)
  })

  it('clears the wishlist when an ebook edition becomes a paperback', async () => {
    seed()
    app.db.exec("INSERT INTO editions (id, book_id, format) VALUES (3, 2, 'ebook')")
    const { status, body } = await api.patch('/api/editions/3', { format: 'paperback' })
    assert.equal(status, 200)
    assert.equal(body.wishlist, false)
    assert.equal(app.db.prepare('SELECT wishlist FROM books WHERE id = 2').pluck().get(), 0)
  })

  it('keeps a wishlist set by hand when a hardcover edition becomes a paperback', async () => {
    seed()
    app.db.exec("INSERT INTO editions (id, book_id, format) VALUES (3, 2, 'hardcover')")
    const { status, body } = await api.patch('/api/editions/3', { format: 'paperback' })
    assert.equal(status, 200)
    assert.equal(body.wishlist, true)
  })

  it('answers 404 for an unknown edition and 400 for a field it does not have', async () => {
    seed()
    assert.deepEqual(await api.patch('/api/editions/99', { format: 'ebook' }), { status: 404, body: { error: 'Edition not found' } })
    assert.deepEqual(await api.patch('/api/editions/2', { book_id: 2 }), { status: 400, body: { error: 'Unknown field in the edition: book_id' } })
  })
})

describe('DELETE /api/editions/:id', () => {
  it('deletes the edition and its cover file and answers 200 with the book', async () => {
    seed()
    const { status, body } = await api.del('/api/editions/2')
    assert.equal(status, 200)
    assert.deepEqual(body.editions.map((e) => e.id), [1])
    assert.equal(body.cover_url, '/covers/e1-0000000a.png')
    assert.deepEqual(coverFiles(coversDir), ['e1-0000000a.png'])
    assert.deepEqual(await api.del('/api/editions/2'), { status: 404, body: { error: 'Edition not found' } })
  })
})
