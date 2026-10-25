/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { JPEG, PNG, loadApp, startServer } from './support/server.js'
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

// Wuthering Heights: a paperback with a cover and a hardcover without one.
// Persuasion: an ebook with a cover, wishlisted. Emma: no editions, a book-level cover.
function seed() {
  app.db.exec(`
    INSERT INTO authors (id, name) VALUES (1, 'Emily Brontë'), (2, 'Jane Austen'), (3, 'Nobody Yet');
    INSERT INTO books (id, title, author_id, synopsis, star_rating, spice_rating, gore_rating, read, wishlist, cover, created_at) VALUES
      (1, 'Wuthering Heights', 1, 'Moors.', 4, 2, 3, 1, 0, NULL, '2023-01-01 00:00:00'),
      (2, 'Persuasion', 2, 'Second chances.', 5, 1, 1, 0, 1, NULL, '2023-01-02 00:00:00'),
      (3, 'Emma', 2, '', 0, 0, 0, 0, 1, 'b3-0000000b.jpg', '2023-01-03 00:00:00'),
      (4, '100% Pure', 3, '', 0, 0, 0, 0, 0, NULL, '2023-01-04 00:00:00');
    INSERT INTO editions (id, book_id, format, isbn, publisher, published, cover) VALUES
      (1, 1, 'paperback', '9780553212587', 'Bantam Books', '1981-03', 'e1-0000000a.jpg'),
      (2, 1, 'hardcover', '9780141439556', NULL, NULL, NULL),
      (3, 2, 'ebook', NULL, NULL, NULL, 'e3-0000000c.png');
  `)
  placeCover(coversDir, 'e1-0000000a.jpg', JPEG)
  placeCover(coversDir, 'e3-0000000c.png', PNG)
  placeCover(coversDir, 'b3-0000000b.jpg', JPEG)
}

const titles = (books) => books.map((book) => book.title)

describe('GET /api/books', () => {
  it('answers an empty array for an empty library', async () => {
    assert.deepEqual(await api.get('/api/books'), { status: 200, body: [] })
  })

  it('lists every book by title with its author, flags as booleans, editions and no synopsis', async () => {
    seed()
    const { status, body } = await api.get('/api/books')
    assert.equal(status, 200)
    assert.deepEqual(titles(body), ['100% Pure', 'Emma', 'Persuasion', 'Wuthering Heights'])
    const heights = body.find((book) => book.id === 1)
    assert.deepEqual(heights, {
      id: 1,
      title: 'Wuthering Heights',
      author: { id: 1, name: 'Emily Brontë' },
      star_rating: 4,
      spice_rating: 2,
      gore_rating: 3,
      read: true,
      wishlist: false,
      created_at: '2023-01-01 00:00:00',
      cover_url: '/covers/e1-0000000a.jpg',
      editions: [
        { id: 2, format: 'hardcover', isbn: '9780141439556', publisher: null, published: null, cover_url: null },
        { id: 1, format: 'paperback', isbn: '9780553212587', publisher: 'Bantam Books', published: '1981-03', cover_url: '/covers/e1-0000000a.jpg' },
      ],
    })
    assert.ok(body.every((book) => !Object.hasOwn(book, 'synopsis')))
  })

  it('filters by title, author name and ISBN through q', async () => {
    seed()
    assert.deepEqual(titles((await api.get('/api/books?q=heights')).body), ['Wuthering Heights'])
    assert.deepEqual(titles((await api.get('/api/books?q=AUSTEN')).body), ['Emma', 'Persuasion'])
    assert.deepEqual(titles((await api.get(`/api/books?q=${encodeURIComponent('0-553-21258-3')}`)).body), ['Wuthering Heights'])
    assert.deepEqual(titles((await api.get('/api/books?q=978-0-553-21258-7')).body), ['Wuthering Heights'])
  })

  it('matches % and _ in q literally', async () => {
    seed()
    assert.deepEqual(titles((await api.get(`/api/books?q=${encodeURIComponent('100%')}`)).body), ['100% Pure'])
    assert.deepEqual(titles((await api.get(`/api/books?q=${encodeURIComponent('%')}`)).body), ['100% Pure'])
    assert.deepEqual(titles((await api.get('/api/books?q=_')).body), [])
  })

  it('filters by format, physical, owned, wishlist, read and author', async () => {
    seed()
    assert.deepEqual(titles((await api.get('/api/books?format=physical')).body), ['Wuthering Heights'])
    assert.deepEqual(titles((await api.get('/api/books?format=ebook')).body), ['Persuasion'])
    assert.deepEqual(titles((await api.get('/api/books?format=hardcover')).body), ['Wuthering Heights'])
    assert.deepEqual(titles((await api.get('/api/books?owned=0')).body), ['100% Pure', 'Emma'])
    assert.deepEqual(titles((await api.get('/api/books?owned=true')).body), ['Persuasion', 'Wuthering Heights'])
    assert.deepEqual(titles((await api.get('/api/books?wishlist=1')).body), ['Emma', 'Persuasion'])
    assert.deepEqual(titles((await api.get('/api/books?wishlist=1&format=ebook')).body), ['Persuasion'])
    assert.deepEqual(titles((await api.get('/api/books?read=false')).body), ['100% Pure', 'Emma', 'Persuasion'])
    assert.deepEqual(titles((await api.get('/api/books?author_id=2')).body), ['Emma', 'Persuasion'])
  })

  it('refuses a bad filter value, an unknown filter and a repeated one', async () => {
    for (const query of ['read=2', 'owned=yes', 'format=audio', 'author_id=x', 'author_id=0', 'sort=title', 'read=1&read=0']) {
      const { status, body } = await api.get(`/api/books?${query}`)
      assert.equal(status, 400, query)
      assert.equal(typeof body.error, 'string', query)
    }
  })
})

describe('the cover rule', () => {
  it('prefers a physical edition, then hardcover, then the lowest id, then the book cover', async () => {
    app.db.exec(`
      INSERT INTO authors (id, name) VALUES (1, 'A');
      INSERT INTO books (id, title, author_id, cover) VALUES (1, 'One', 1, 'b1-00000001.jpg'), (2, 'Two', 1, NULL), (3, 'Three', 1, 'b3-00000003.jpg');
      INSERT INTO editions (id, book_id, format, cover) VALUES
        (10, 1, 'ebook', 'e10-0000000a.jpg'),
        (11, 1, 'paperback', 'e11-0000000b.jpg'),
        (12, 1, 'hardcover', 'e12-0000000c.jpg'),
        (13, 2, 'ebook', 'e13-0000000d.jpg'),
        (14, 2, 'paperback', NULL),
        (15, 3, 'ebook', NULL);
      INSERT INTO editions (id, book_id, format, isbn, cover) VALUES (16, 2, 'paperback', '9780553212587', 'e16-0000000e.jpg'), (17, 2, 'paperback', '9780141439556', 'e17-0000000f.jpg');
    `)
    const books = (await api.get('/api/books')).body
    const cover = (title) => books.find((book) => book.title === title).cover_url
    assert.equal(cover('One'), '/covers/e12-0000000c.jpg')
    assert.equal(cover('Two'), '/covers/e16-0000000e.jpg')
    assert.equal(cover('Three'), '/covers/b3-00000003.jpg')
    assert.deepEqual(books.find((book) => book.title === 'Two').editions.map((edition) => edition.id), [14, 16, 17, 13])
  })
})

describe('GET /api/books/:id', () => {
  it('answers the book with its synopsis', async () => {
    seed()
    const { status, body } = await api.get('/api/books/1')
    assert.equal(status, 200)
    assert.equal(body.synopsis, 'Moors.')
    assert.equal(body.title, 'Wuthering Heights')
  })

  it('answers 404 for an unknown or malformed id', async () => {
    for (const id of ['99', 'abc', '0', '-1', '1.5']) {
      assert.deepEqual(await api.get(`/api/books/${id}`), { status: 404, body: { error: 'Book not found' } }, id)
    }
  })
})

describe('POST /api/books', () => {
  it('creates a book for an existing author by id and answers 201 with the book', async () => {
    seed()
    const { status, body } = await api.post('/api/books', { title: '  Villette  ', author_id: 1, star_rating: 3, read: true, synopsis: 'Lucy Snowe.' })
    assert.equal(status, 201)
    assert.equal(body.title, 'Villette')
    assert.deepEqual(body.author, { id: 1, name: 'Emily Brontë' })
    assert.equal(body.star_rating, 3)
    assert.equal(body.read, true)
    assert.equal(body.wishlist, false)
    assert.equal(body.synopsis, 'Lucy Snowe.')
    assert.deepEqual(body.editions, [])
    assert.equal(body.cover_url, null)
  })

  it('finds an author by name case-insensitively with whitespace collapsed, or creates one', async () => {
    seed()
    const found = await api.post('/api/books', { title: 'Sanditon', author_name: '  jane   AUSTEN ' })
    assert.equal(found.status, 201)
    assert.deepEqual(found.body.author, { id: 2, name: 'Jane Austen' })

    const created = await api.post('/api/books', { title: 'Middlemarch', author_name: 'George  Eliot' })
    assert.equal(created.status, 201)
    assert.equal(created.body.author.name, 'George Eliot')
    assert.equal(app.db.prepare("SELECT COUNT(*) FROM authors WHERE name = 'George Eliot'").pluck().get(), 1)
  })

  it('creates the edition with its ISBN stored as ISBN-13 and clears wishlist for a physical one', async () => {
    seed()
    const { status, body } = await api.post('/api/books', {
      title: 'Pride and Prejudice', author_id: 2, wishlist: true,
      edition: { format: 'paperback', isbn: '0-14-143951-3', publisher: 'Penguin Books', published: '2003' },
    })
    assert.equal(status, 201)
    assert.equal(body.wishlist, false)
    assert.deepEqual(body.editions.map(({ format, isbn, publisher, published }) => ({ format, isbn, publisher, published })), [
      { format: 'paperback', isbn: '9780141439518', publisher: 'Penguin Books', published: '2003' },
    ])
  })

  it('keeps wishlist for an ebook edition', async () => {
    seed()
    const { body } = await api.post('/api/books', { title: 'Lady Susan', author_id: 2, wishlist: 1, edition: { format: 'ebook', isbn: '' } })
    assert.equal(body.wishlist, true)
    assert.equal(body.editions[0].isbn, null)
  })

  it('saves a multipart cover on the edition, named by the edition id and the sniffed type', async () => {
    seed()
    const { status, body } = await api.post('/api/books', multipart({ title: 'Lady Susan', author_id: 2, edition: { format: 'ebook' } }, PNG, { filename: 'x.jpg' }))
    assert.equal(status, 201)
    const editionId = body.editions[0].id
    assert.match(body.editions[0].cover_url, new RegExp(`^/covers/e${editionId}-[0-9a-f]{8}\\.png$`))
    assert.equal(body.cover_url, body.editions[0].cover_url)
    assert.ok(fs.readFileSync(path.join(coversDir, path.basename(body.cover_url))).equals(PNG))
  })

  it('saves a cover without an edition on the book', async () => {
    seed()
    const { status, body } = await api.post('/api/books', multipart({ title: 'Lady Susan', author_id: 2, wishlist: true }, JPEG))
    assert.equal(status, 201)
    assert.match(body.cover_url, new RegExp(`^/covers/b${body.id}-[0-9a-f]{8}\\.jpg$`))
    assert.ok(fs.existsSync(path.join(coversDir, path.basename(body.cover_url))))
  })

  it('answers 409 with the existing book for a title the author already has', async () => {
    seed()
    const { status, body } = await api.post('/api/books', { title: 'wuthering   HEIGHTS', author_name: 'emily brontë' })
    assert.deepEqual({ status, body }, {
      status: 409,
      body: { error: '"wuthering HEIGHTS" by Emily Brontë is already in the library', conflict: { book_id: 1 } },
    })
  })

  it('answers 409 with the owning book for an ISBN already in the library, and stores nothing', async () => {
    seed()
    const before = coverFiles(coversDir)
    const { status, body } = await api.post('/api/books', multipart({ title: 'Another', author_name: 'New Person', edition: { format: 'paperback', isbn: '9780553212587' } }, JPEG))
    assert.deepEqual({ status, body }, {
      status: 409,
      body: { error: 'ISBN 9780553212587 is already in the library', conflict: { book_id: 1, edition_id: 1 } },
    })
    assert.equal(app.db.prepare("SELECT COUNT(*) FROM authors WHERE name = 'New Person'").pluck().get(), 0)
    assert.deepEqual(coverFiles(coversDir), before)
  })

  it('refuses invalid payloads with 400', async () => {
    seed()
    const cases = [
      [{ author_id: 1 }, 'title is required'],
      [{ title: 'x' }, 'author_id or author_name is required'],
      [{ title: 'x', author_id: 1, author_name: 'A' }, 'Send author_id or author_name, not both'],
      [{ title: 'x', author_id: 99 }, 'No author has the id 99'],
      [{ title: '   ', author_id: 1 }, 'title must not be empty'],
      [{ title: 'x', author_id: 1, star_rating: '4' }, 'star_rating must be a whole number from 0 to 5'],
      [{ title: 'x', author_id: 1, star_rating: 6 }, 'star_rating must be a whole number from 0 to 5'],
      [{ title: 'x', author_id: 1, gore_rating: 2.5 }, 'gore_rating must be a whole number from 0 to 5'],
      [{ title: 'x', author_id: 1, read: 'true' }, 'read must be true or false'],
      [{ title: 'x', author_id: 1, isbn: '9780553212587' }, 'Unknown field in the book: isbn'],
      [{ title: 'x', author_id: 1, cover: null }, 'Unknown field in the book: cover'],
      [{ title: 'x', author_id: 1, edition: { isbn: '9780140449129' } }, 'format is required'],
      [{ title: 'x', author_id: 1, edition: { format: 'Hardcover' } }, 'format must be one of hardcover, paperback, ebook'],
      [{ title: 'x', author_id: 1, edition: { format: 'paperback', isbn: '9780140449122' } }, '"9780140449122" is not a valid ISBN-10 or ISBN-13'],
      [{ title: 'x', author_id: 1, edition: { format: 'paperback', published: 'March 2005' } }, 'published must be YYYY, YYYY-MM or YYYY-MM-DD'],
      [{ title: 'x', author_id: 1, edition: { format: 'paperback', cover_from_url: 'http://covers.openlibrary.org/b/id/1-L.jpg' } }, 'cover_from_url must be an https URL'],
      [{ title: 'x', author_id: 1, edition: { format: 'paperback', cover_url: '/covers/e1-0000000a.jpg' } }, 'Unknown field in the edition: cover_url'],
      [[], 'The book must be a JSON object'],
    ]
    for (const [payload, error] of cases) {
      assert.deepEqual(await api.post('/api/books', payload), { status: 400, body: { error } }, JSON.stringify(payload))
    }
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM books').pluck().get(), 4)
  })

  it('refuses a multipart part other than data and cover', async () => {
    seed()
    const stray = await api.post('/api/books', multipart({ title: 'x', author_id: 1 }, null, { parts: { title: 'y' } }))
    assert.equal(stray.status, 400)
    const alone = await api.post('/api/books', multipart(undefined, null, { parts: { title: 'y' } }))
    assert.deepEqual(alone, { status: 400, body: { error: 'A multipart body has only a data part and a cover file' } })
    const misnamed = new FormData()
    misnamed.append('data', JSON.stringify({ title: 'x', author_id: 1 }))
    misnamed.append('image', new Blob([JPEG], { type: 'image/jpeg' }), 'a.jpg')
    assert.equal((await api.post('/api/books', misnamed)).status, 400)
    assert.deepEqual(await api.post('/api/books', multipart('{not json')), { status: 400, body: { error: 'The data part is not valid JSON' } })
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM books').pluck().get(), 4)
  })

  it('refuses a cover that is not JPEG, PNG or WebP whatever its MIME type, and stores nothing', async () => {
    seed()
    const { status, body } = await api.post('/api/books', multipart({ title: 'x', author_id: 1, edition: { format: 'paperback' } }, Buffer.from('<html></html>'), { type: 'image/jpeg' }))
    assert.deepEqual({ status, body }, { status: 400, body: { error: 'The cover must be a JPEG, PNG or WebP image' } })
    assert.equal(app.db.prepare("SELECT COUNT(*) FROM books WHERE title = 'x'").pluck().get(), 0)
    assert.deepEqual(coverFiles(coversDir), ['b3-0000000b.jpg', 'e1-0000000a.jpg', 'e3-0000000c.png'])
  })

  it('refuses two cover sources in one request', async () => {
    seed()
    const payload = { title: 'x', author_id: 1, edition: { format: 'paperback', cover_from_url: 'https://covers.openlibrary.org/b/id/1-L.jpg' } }
    const { status, body } = await api.post('/api/books', multipart(payload, JPEG))
    assert.deepEqual({ status, body }, { status: 400, body: { error: 'Send one cover at most: a file, a cover_from_url or cover: null' } })
  })

  it('answers 413 for a cover over 10 MB', async () => {
    seed()
    const big = Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)])
    const { status, body } = await api.post('/api/books', multipart({ title: 'x', author_id: 1 }, big))
    assert.deepEqual({ status, body }, { status: 413, body: { error: 'The cover is larger than 10 MB' } })
    assert.equal(app.db.prepare("SELECT COUNT(*) FROM books WHERE title = 'x'").pluck().get(), 0)
  })
})

describe('PATCH /api/books/:id', () => {
  it('changes only the sent fields and answers the book', async () => {
    seed()
    const { status, body } = await api.patch('/api/books/1', { star_rating: 2, read: false })
    assert.equal(status, 200)
    assert.equal(body.star_rating, 2)
    assert.equal(body.read, false)
    assert.equal(body.spice_rating, 2)
    assert.equal(body.synopsis, 'Moors.')
  })

  it('moves a book to an author found or created by name', async () => {
    seed()
    const { body } = await api.patch('/api/books/4', { author_name: 'jane austen' })
    assert.deepEqual(body.author, { id: 2, name: 'Jane Austen' })
  })

  it('answers 409 with the other book when a rename collides with the same author', async () => {
    seed()
    const { status, body } = await api.patch('/api/books/3', { title: 'PERSUASION' })
    assert.deepEqual({ status, body }, { status: 409, body: { error: '"PERSUASION" by Jane Austen is already in the library', conflict: { book_id: 2 } } })
    const moved = await api.patch('/api/books/2', { author_id: 1, title: 'Wuthering Heights' })
    assert.deepEqual(moved.body.conflict, { book_id: 1 })
  })

  it('replaces the book cover and deletes the old file after the commit', async () => {
    seed()
    const { status, body } = await api.patch('/api/books/3', multipart({}, PNG))
    assert.equal(status, 200)
    assert.match(body.cover_url, /^\/covers\/b3-[0-9a-f]{8}\.png$/)
    assert.ok(!coverFiles(coversDir).includes('b3-0000000b.jpg'))
    assert.ok(coverFiles(coversDir).includes(path.basename(body.cover_url)))
  })

  it('removes the book cover for cover: null', async () => {
    seed()
    const { body } = await api.patch('/api/books/3', { cover: null })
    assert.equal(body.cover_url, null)
    assert.ok(!coverFiles(coversDir).includes('b3-0000000b.jpg'))
  })

  it('keeps the old cover when the update is refused', async () => {
    seed()
    const { status } = await api.patch('/api/books/3', multipart({ title: 'Persuasion' }, PNG))
    assert.equal(status, 409)
    assert.deepEqual(coverFiles(coversDir), ['b3-0000000b.jpg', 'e1-0000000a.jpg', 'e3-0000000c.png'])
    assert.equal(app.db.prepare('SELECT cover FROM books WHERE id = 3').pluck().get(), 'b3-0000000b.jpg')
  })

  it('refuses edition and unknown fields, and answers 404 for an unknown book', async () => {
    seed()
    assert.deepEqual(await api.patch('/api/books/1', { edition: { format: 'ebook' } }), { status: 400, body: { error: 'Unknown field in the book: edition' } })
    assert.deepEqual(await api.patch('/api/books/1', { cover: 'e1-0000000a.jpg' }), { status: 400, body: { error: 'cover may only be null, which removes the cover' } })
    assert.deepEqual(await api.patch('/api/books/99', { read: true }), { status: 404, body: { error: 'Book not found' } })
  })
})

describe('DELETE /api/books/:id', () => {
  it('deletes the book, its editions and every cover file it names', async () => {
    seed()
    app.db.exec("UPDATE books SET cover = 'b1-0000000d.jpg' WHERE id = 1")
    placeCover(coversDir, 'b1-0000000d.jpg', JPEG)
    assert.deepEqual(await api.del('/api/books/1'), { status: 204, body: null })
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM editions WHERE book_id = 1').pluck().get(), 0)
    assert.deepEqual(coverFiles(coversDir), ['b3-0000000b.jpg', 'e3-0000000c.png'])
    assert.deepEqual(await api.del('/api/books/1'), { status: 404, body: { error: 'Book not found' } })
  })
})
