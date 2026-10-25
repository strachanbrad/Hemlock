/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { JPEG, loadApp, startServer } from './support/server.js'

let app
let coversDir
before(async () => {
  app = await startServer()
  coversDir = (await loadApp()).coversDir
})
after(() => app.close())

beforeEach(() => {
  app.db.exec('DELETE FROM Books; DELETE FROM EBooks; DELETE FROM Authors;')
  fs.rmSync(coversDir, { recursive: true, force: true })
})

const get = async (url) => {
  const response = await fetch(app.base + url)
  return { status: response.status, body: await response.json() }
}

const addCover = (isbn) => {
  fs.mkdirSync(coversDir, { recursive: true })
  fs.writeFileSync(path.join(coversDir, `${isbn}.jpg`), JPEG)
}

// The Books and EBooks columns are loosely typed: ratings and read arrive as strings or null, media in any case.
const seed = () => {
  app.db.exec(`
    INSERT INTO Authors (author_id, first_name, last_name) VALUES (1, 'Emily', 'Brontë'), (2, 'Jane', 'Austen');
    INSERT INTO Books (isbn, star_rating, spice_rating, gore_rating, title, author_id, synopsis, read, media) VALUES
      ('9780553212587', 4, 2, 3, 'Wuthering Heights', 1, 'Moors.', 1, 'Hardcover'),
      ('9781501120686', '5', NULL, '1', 'pride and Prejudice', 2, NULL, 'true', 'paperback'),
      ('9780140430892', NULL, 0, NULL, 'Jane Eyre', NULL, 'Thornfield.', NULL, 'Hardback');
    INSERT INTO EBooks (isbn, star_rating, spice_rating, gore_rating, title, author_id, synopsis, read, media, buy) VALUES
      ('9780316000011', 5, 1, 1, 'Persuasion', 2, 'Second chances.', 0, 'Ebook', 1),
      ('9780553212587', 3, '2', 2, 'Wuthering Heights', 1, 'Moors again.', '0', 'EBook', 0);
  `)
}

const titles = (body) => body.map((book) => `${book.id} ${book.title}`)

describe('GET /api/display', () => {
  it('answers an empty array for an empty library', async () => {
    assert.deepEqual(await get('/api/display'), { status: 200, body: [] })
  })

  it('answers one flat record per book and ebook, with the cover file that exists', async () => {
    seed()
    addCover('9780553212587')
    const { status, body } = await get('/api/display?filter=all')
    assert.equal(status, 200)
    assert.deepEqual(body, [
      {
        id: 'b9780140430892', title: 'Jane Eyre', author: null, synopsis: 'Thornfield.', cover_url: null,
        format: null, read: false, star_rating: 0, spice_rating: 0, gore_rating: 0,
      },
      {
        id: 'e9780316000011', title: 'Persuasion', author: 'Jane Austen', synopsis: 'Second chances.', cover_url: null,
        format: 'ebook', read: false, star_rating: 5, spice_rating: 1, gore_rating: 1,
      },
      {
        id: 'b9781501120686', title: 'pride and Prejudice', author: 'Jane Austen', synopsis: '', cover_url: null,
        format: 'paperback', read: true, star_rating: 5, spice_rating: 0, gore_rating: 1,
      },
      {
        id: 'b9780553212587', title: 'Wuthering Heights', author: 'Emily Brontë', synopsis: 'Moors.',
        cover_url: '/covers/9780553212587.jpg', format: 'hardcover', read: true, star_rating: 4, spice_rating: 2, gore_rating: 3,
      },
      {
        id: 'e9780553212587', title: 'Wuthering Heights', author: 'Emily Brontë', synopsis: 'Moors again.',
        cover_url: '/covers/9780553212587.jpg', format: 'ebook', read: false, star_rating: 3, spice_rating: 2, gore_rating: 2,
      },
    ])
  })

  it('orders by title ignoring case, then by id', async () => {
    seed()
    assert.deepEqual(titles((await get('/api/display?filter=all')).body), [
      'b9780140430892 Jane Eyre',
      'e9780316000011 Persuasion',
      'b9781501120686 pride and Prejudice',
      'b9780553212587 Wuthering Heights',
      'e9780553212587 Wuthering Heights',
    ])
  })

  it('filters by read status, and owned (the default) lists every copy', async () => {
    seed()
    const ids = async (query) => (await get(`/api/display${query}`)).body.map((book) => book.id)
    const all = await ids('?filter=all')
    assert.equal(all.length, 5)
    assert.deepEqual(await ids('?filter=owned'), all)
    assert.deepEqual(await ids(''), all)
    assert.deepEqual(await ids('?filter=read'), ['b9781501120686', 'b9780553212587'])
    assert.deepEqual(await ids('?filter=unread'), ['b9780140430892', 'e9780316000011', 'e9780553212587'])
  })

  it('gives a null cover_url when the cover file is missing or the covers directory is absent', async () => {
    seed()
    assert.ok(!fs.existsSync(coversDir))
    assert.ok((await get('/api/display')).body.every((book) => book.cover_url === null))

    addCover('9780316000011')
    fs.writeFileSync(path.join(coversDir, '9780140430892.png'), JPEG)
    const covers = Object.fromEntries((await get('/api/display')).body.map((book) => [book.id, book.cover_url]))
    assert.equal(covers.e9780316000011, '/covers/9780316000011.jpg')
    assert.equal(covers.b9780140430892, null)
    assert.equal(covers.b9780553212587, null)
  })

  it('answers 400 with an error for an unknown filter', async () => {
    seed()
    for (const query of ['?filter=wishlist', '?filter=', '?filter=ALL', '?filter=all&filter=read']) {
      const { status, body } = await get(`/api/display${query}`)
      assert.equal(status, 400, query)
      assert.deepEqual(body, { error: 'filter must be all, read, unread or owned' }, query)
    }
  })
})
