/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { JPEG, PNG, loadApp, startServer } from './support/server.js'

const rootVersion = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../package.json'), 'utf8')).version

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

const send = async (method, url, body) => {
  const init = { method }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  const response = await fetch(app.base + url, init)
  return { status: response.status, body: await response.json() }
}

const seed = () => {
  app.db.exec(`
    INSERT INTO Authors (author_id, first_name, last_name) VALUES (1, 'Emily', 'Brontë'), (2, 'Jane', 'Austen');
    INSERT INTO Books (isbn, star_rating, spice_rating, gore_rating, title, author_id, synopsis, read, media)
      VALUES ('9780553212587', 4, 2, 3, 'Wuthering Heights', 1, 'Moors.', 1, 'Hardcover');
    INSERT INTO EBooks (isbn, star_rating, spice_rating, gore_rating, title, author_id, synopsis, read, media, buy)
      VALUES ('9780316000011', 5, 1, 1, 'Persuasion', 2, 'Second chances.', 0, 'Ebook', 1);
  `)
}

const coverForm = (fields, cover, filename = 'cover.jpg') => {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value))
  if (cover) form.append('cover', new Blob([cover], { type: 'image/jpeg' }), filename)
  return form
}

describe('GET /api/health', () => {
  it('answers ok with the app version and the highest applied migration', async () => {
    assert.deepEqual(await get('/api/health'), { status: 200, body: { ok: true, version: rootVersion, schema: 1 } })
  })
})

describe('the lists', () => {
  it('answer 200 with an empty data array when there is nothing to list', async () => {
    assert.deepEqual((await get('/api/authors')), { status: 200, body: { message: 'Authors retrieved successfully', data: [] } })
    for (const url of ['/api/Books/get/', '/api/EBooks/get', '/api/Books/author/1', '/api/EBooks/author/1']) {
      const { status, body } = await get(url)
      assert.equal(status, 200, url)
      assert.deepEqual(body.data, [], url)
    }
  })

  it('return the rows of the table the book type names', async () => {
    seed()
    assert.deepEqual((await get('/api/Books/get/')).body.data.map((book) => book.title), ['Wuthering Heights'])
    assert.deepEqual((await get('/api/EBooks/author/2')).body.data.map((book) => [book.title, book.buy]), [['Persuasion', 1]])
    assert.deepEqual((await get('/api/authors')).body.data.map((author) => author.last_name), ['Brontë', 'Austen'])
  })

  it('refuse a book type other than Books or EBooks', async () => {
    for (const url of ['/api/Authors/get', '/api/sqlite_schema/get', '/api/schema_migrations/author/1']) {
      assert.deepEqual(await get(url), { status: 400, body: { error: 'Invalid book type' } }, url)
    }
  })
})

describe('/api/data/:table', () => {
  it('inserts an author', async () => {
    const { status, body } = await send('POST', '/api/data/Authors', { author_id: 3, first_name: 'Leo', last_name: 'Tolstoy' })
    assert.equal(status, 200)
    assert.equal(body.lastID, 3)
    assert.equal(app.db.prepare('SELECT last_name FROM Authors WHERE author_id = 3').pluck().get(), 'Tolstoy')
  })

  it('touches only the whitelisted tables and columns', async () => {
    seed()
    assert.deepEqual(await send('POST', '/api/data/Books', { isbn: '1', title: 'x', media: 'x' }), { status: 400, body: { error: 'Invalid table name' } })
    assert.deepEqual(await send('POST', '/api/data/Authors', { first_name: 'A', last_name: 'B', 'x"); DROP TABLE Books; --': 1 }), {
      status: 400,
      body: { error: 'Unknown column: x"); DROP TABLE Books; --' },
    })
    assert.deepEqual(await send('POST', '/api/data/Authors', { first_name: { a: 1 }, last_name: 'B' }), { status: 400, body: { error: 'Invalid value for first_name' } })
    assert.deepEqual(await send('DELETE', '/api/data/Authors/1'), { status: 400, body: { error: 'Invalid table name' } })
    assert.deepEqual(await send('DELETE', '/api/data/schema_migrations/1'), { status: 400, body: { error: 'Invalid table name' } })
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM Books').pluck().get(), 1)
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get(), 1)
  })

  it('answers a duplicate key with 409 and keeps the SQLite message out of the body', async () => {
    seed()
    const { status, body } = await send('POST', '/api/data/Authors', { author_id: 1, first_name: 'A', last_name: 'B' })
    assert.equal(status, 409)
    assert.deepEqual(body, { error: 'A record with that key already exists' })
  })

  it('deletes a book by ISBN, then answers 404', async () => {
    seed()
    assert.equal((await send('DELETE', '/api/data/Books/9780553212587')).status, 200)
    assert.deepEqual(await send('DELETE', '/api/data/Books/9780553212587'), { status: 404, body: { error: 'No record found with the provided id' } })
  })
})

describe('book writes', () => {
  it('updates the sent fields and saves an uploaded cover as <isbn>.jpg', async () => {
    seed()
    const { status, body } = await send('POST', '/api/Books/9780553212587/update', coverForm({ star_rating: 2, read: 0, buy: 1 }, PNG, 'cover.png'))
    assert.equal(status, 200)
    assert.equal(body.data.star_rating, 2)
    assert.equal(body.data.read, 0)
    assert.equal(body.data.buy, undefined)
    assert.ok(fs.readFileSync(path.join(coversDir, '9780553212587.jpg')).equals(PNG))
    const cover = await fetch(`${app.base}/covers/9780553212587.jpg`)
    assert.equal(cover.status, 200)
  })

  it('refuses a cover that is not an image and changes nothing', async () => {
    seed()
    const { status, body } = await send('POST', '/api/Books/9780553212587/update', coverForm({ star_rating: 1 }, Buffer.from('<html></html>')))
    assert.deepEqual({ status, body }, { status: 400, body: { error: 'The cover must be a JPEG, PNG or WebP image' } })
    assert.equal(app.db.prepare("SELECT star_rating FROM Books WHERE isbn = '9780553212587'").pluck().get(), 4)
    assert.ok(!fs.existsSync(coversDir) || fs.readdirSync(coversDir).length === 0)
  })

  it('never writes a cover outside the covers directory', async () => {
    seed()
    app.db.prepare("INSERT INTO Books (isbn, title, author_id, media) VALUES ('../../escape', 'x', 1, 'Hardcover')").run()
    const { status } = await send('POST', `/api/Books/${encodeURIComponent('../../escape')}/update`, coverForm({ read: 1 }, JPEG))
    assert.equal(status, 400)
    assert.ok(!fs.existsSync(path.join(coversDir, '..', '..', 'escape.jpg')))
  })

  it('answers 413 for a cover over 10 MB', async () => {
    seed()
    const big = Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)])
    const { status, body } = await send('POST', '/api/Books/9780553212587/update', coverForm({}, big))
    assert.deepEqual({ status, body }, { status: 413, body: { error: 'The cover is larger than 10 MB' } })
  })

  it('inserts a book with its cover', async () => {
    seed()
    const fields = { isbn: '9780141439518', title: 'Pride and Prejudice', author_id: 2, media: 'Paperback', star_rating: 4, spice_rating: 1, gore_rating: 0, synopsis: 's' }
    const { status } = await send('POST', '/api/Books/9780141439518/insert', coverForm(fields, JPEG))
    assert.equal(status, 200)
    assert.equal(app.db.prepare("SELECT title FROM Books WHERE isbn = '9780141439518'").pluck().get(), 'Pride and Prejudice')
    assert.ok(fs.existsSync(path.join(coversDir, '9780141439518.jpg')))
  })

  it('stores no book when its cover is refused', async () => {
    seed()
    const fields = { isbn: '9780141439518', title: 'Emma', author_id: 2, media: 'Paperback' }
    const { status } = await send('POST', '/api/Books/9780141439518/insert', coverForm(fields, Buffer.from('GIF89a')))
    assert.equal(status, 400)
    assert.equal(app.db.prepare("SELECT COUNT(*) FROM Books WHERE isbn = '9780141439518'").pluck().get(), 0)
  })

  it('rolls an insert back when its author does not exist', async () => {
    seed()
    const fields = { isbn: '9780141439518', title: 'x', author_id: 99, media: 'Paperback' }
    const { status, body } = await send('POST', '/api/Books/9780141439518/insert', coverForm(fields, JPEG))
    assert.deepEqual({ status, body }, { status: 400, body: { error: 'The data breaks a database constraint' } })
    assert.ok(!fs.existsSync(path.join(coversDir, '9780141439518.jpg')))
  })

  it('moves a purchased ebook to Books with its new media', async () => {
    seed()
    assert.equal((await send('POST', '/api/convertEBookToBook', { isbn: '9780316000011', media: 'Paperback' })).status, 200)
    assert.equal(app.db.prepare("SELECT COUNT(*) FROM EBooks WHERE isbn = '9780316000011'").pluck().get(), 0)
    assert.deepEqual(app.db.prepare("SELECT title, media, star_rating FROM Books WHERE isbn = '9780316000011'").get(), {
      title: 'Persuasion', media: 'Paperback', star_rating: 5,
    })
    assert.deepEqual(await send('POST', '/api/convertEBookToBook', { isbn: '9780316000011', media: 'Paperback' }), { status: 404, body: { error: 'EBook not found' } })
    assert.deepEqual(await send('POST', '/api/convertEBookToBook'), { status: 400, body: { error: 'ISBN must be provided' } })
  })
})

describe('errors', () => {
  it('answer JSON for an unknown path and for malformed JSON', async () => {
    assert.deepEqual(await get('/api/nothing/here/at/all'), { status: 404, body: { error: 'Not found' } })
    assert.deepEqual(await get('/covers/9780000000000.jpg'), { status: 404, body: { error: 'Not found' } })
    const { status, body } = await send('POST', '/api/data/Authors', '{bad')
    assert.equal(status, 400)
    assert.equal(typeof body.error, 'string')
  })
})
