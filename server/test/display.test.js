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

// Wuthering Heights: a paperback with a cover and an ebook with another. Persuasion: an ebook
// without a cover. pride and Prejudice: not owned, with a book cover. Jane Eyre: a hardcover without a cover.
const seed = () => {
  app.db.exec(`
    INSERT INTO authors (id, name) VALUES (1, 'Emily Brontë'), (2, 'Jane Austen'), (3, 'Charlotte Brontë');
    INSERT INTO books (id, title, author_id, synopsis, star_rating, spice_rating, gore_rating, read, wishlist, cover) VALUES
      (1, 'Wuthering Heights', 1, 'Moors.', 4, 2, 3, 1, 0, NULL),
      (2, 'Persuasion', 2, 'Second chances.', 5, 1, 1, 0, 1, NULL),
      (3, 'pride and Prejudice', 2, '', 5, 0, 1, 1, 1, 'b3-0000000c.jpg'),
      (4, 'Jane Eyre', 3, 'Thornfield.', 0, 0, 0, 0, 0, NULL);
    INSERT INTO editions (id, book_id, format, isbn, cover) VALUES
      (1, 1, 'ebook', NULL, 'e1-0000000a.png'),
      (2, 1, 'paperback', '9780553212587', 'e2-0000000b.jpg'),
      (3, 2, 'ebook', NULL, NULL),
      (4, 4, 'hardcover', '9780141441146', NULL);
  `)
}

const ids = async (query) => (await api.get(`/api/display${query}`)).body.map((book) => book.id)

describe('GET /api/display', () => {
  it('answers an empty array for an empty library', async () => {
    assert.deepEqual(await api.get('/api/display'), { status: 200, body: [] })
  })

  it('answers one flat record per book, with the cover and format the cover rule picks', async () => {
    seed()
    const { status, body } = await api.get('/api/display?filter=all')
    assert.equal(status, 200)
    assert.deepEqual(body, [
      {
        id: 4, title: 'Jane Eyre', author: 'Charlotte Brontë', synopsis: 'Thornfield.', cover_url: null,
        format: 'hardcover', read: false, star_rating: 0, spice_rating: 0, gore_rating: 0,
      },
      {
        id: 2, title: 'Persuasion', author: 'Jane Austen', synopsis: 'Second chances.', cover_url: null,
        format: 'ebook', read: false, star_rating: 5, spice_rating: 1, gore_rating: 1,
      },
      {
        id: 3, title: 'pride and Prejudice', author: 'Jane Austen', synopsis: '', cover_url: '/covers/b3-0000000c.jpg',
        format: null, read: true, star_rating: 5, spice_rating: 0, gore_rating: 1,
      },
      {
        id: 1, title: 'Wuthering Heights', author: 'Emily Brontë', synopsis: 'Moors.', cover_url: '/covers/e2-0000000b.jpg',
        format: 'paperback', read: true, star_rating: 4, spice_rating: 2, gore_rating: 3,
      },
    ])
  })

  it('filters by read status, and owned (the default) leaves out a book with no edition', async () => {
    seed()
    assert.deepEqual(await ids('?filter=all'), [4, 2, 3, 1])
    assert.deepEqual(await ids('?filter=owned'), [4, 2, 1])
    assert.deepEqual(await ids(''), [4, 2, 1])
    assert.deepEqual(await ids('?filter=read'), [3, 1])
    assert.deepEqual(await ids('?filter=unread'), [4, 2])
  })

  it('orders by title ignoring case, then by id', async () => {
    seed()
    app.db.exec("INSERT INTO books (id, title, author_id) VALUES (5, 'jane eyre', 1)")
    assert.deepEqual(await ids('?filter=all'), [4, 5, 2, 3, 1])
  })

  it('answers 400 with an error for an unknown filter', async () => {
    seed()
    for (const query of ['?filter=wishlist', '?filter=', '?filter=ALL', '?filter=all&filter=read']) {
      const { status, body } = await api.get(`/api/display${query}`)
      assert.equal(status, 400, query)
      assert.deepEqual(body, { error: 'filter must be all, read, unread or owned' }, query)
    }
  })
})
