/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { loadApp, startServer } from './support/server.js'
import { client, emptyLibrary } from './support/http.js'

let app
let api
let coversDir
before(async () => {
  app = await startServer()
  api = client(app.base, app.cookie)
  coversDir = (await loadApp()).coversDir
})
after(() => app.close())
beforeEach(() => emptyLibrary(app.db, coversDir))

function seed() {
  app.db.exec(`
    INSERT INTO authors (id, name) VALUES (1, 'jane Austen'), (2, 'Emily Brontë'), (3, 'Nobody');
    INSERT INTO books (title, author_id) VALUES ('Emma', 1), ('Persuasion', 1), ('Wuthering Heights', 2);
  `)
}

describe('GET /api/authors', () => {
  it('lists every author by name, case-insensitively, with a book count', async () => {
    seed()
    assert.deepEqual(await api.get('/api/authors'), {
      status: 200,
      body: [
        { id: 2, name: 'Emily Brontë', book_count: 1 },
        { id: 1, name: 'jane Austen', book_count: 2 },
        { id: 3, name: 'Nobody', book_count: 0 },
      ],
    })
  })
})

describe('PATCH /api/authors/:id', () => {
  it('renames, trimming and collapsing whitespace, and answers the author', async () => {
    seed()
    assert.deepEqual(await api.patch('/api/authors/1', { name: '  Jane   Austen ' }), { status: 200, body: { id: 1, name: 'Jane Austen', book_count: 2 } })
  })

  it('answers 409 with the other author for a name in use', async () => {
    seed()
    assert.deepEqual(await api.patch('/api/authors/3', { name: 'emily brontë' }), {
      status: 409,
      body: { error: 'An author named emily brontë exists', conflict: { author_id: 2 } },
    })
  })

  it('refuses an empty or missing name and unknown fields, and answers 404 for an unknown author', async () => {
    seed()
    assert.deepEqual(await api.patch('/api/authors/1', { name: ' ' }), { status: 400, body: { error: 'name must not be empty' } })
    assert.deepEqual(await api.patch('/api/authors/1', {}), { status: 400, body: { error: 'name is required' } })
    assert.deepEqual(await api.patch('/api/authors/1', { name: 'A', id: 4 }), { status: 400, body: { error: 'Unknown field in the author: id' } })
    assert.deepEqual(await api.patch('/api/authors/99', { name: 'A' }), { status: 404, body: { error: 'Author not found' } })
  })
})

describe('DELETE /api/authors/:id', () => {
  it('deletes an author with no books', async () => {
    seed()
    assert.deepEqual(await api.del('/api/authors/3'), { status: 204, body: null })
    assert.deepEqual(await api.del('/api/authors/3'), { status: 404, body: { error: 'Author not found' } })
  })

  it('answers 409 while the author has books', async () => {
    seed()
    assert.deepEqual(await api.del('/api/authors/1'), {
      status: 409,
      body: { error: 'The author has 2 books; delete or move them first', conflict: { book_count: 2 } },
    })
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM authors WHERE id = 1').pluck().get(), 1)
  })
})
