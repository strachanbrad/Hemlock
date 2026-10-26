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

const OL_COVER = 'https://covers.openlibrary.org/b/id/14839277-L.jpg'
const jpeg = Buffer.concat([JPEG, Buffer.alloc(2048, 7)])

// The real saveCoverFromUrl with its network replaced: each test sets `upstream`.
const requests = []
let upstream = () => new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } })
const logs = []

let app
let api
let coversDir
let covers
before(async () => {
  covers = await loadApp()
  coversDir = covers.coversDir
  const fetch = async (url, init) => {
    requests.push(url)
    return upstream(url, init)
  }
  app = await startServer({ saveCover: (url, base) => covers.saveCoverFromUrl(url, base, { fetch, log: (line) => logs.push(line) }) })
  api = client(app.base, app.cookie)
})
after(() => app.close())
beforeEach(() => {
  emptyLibrary(app.db, coversDir)
  requests.length = 0
  logs.length = 0
  upstream = () => new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } })
  app.db.exec("INSERT INTO authors (id, name) VALUES (1, 'Emily Brontë'); INSERT INTO books (id, title, author_id, wishlist) VALUES (1, 'Wuthering Heights', 1, 1)")
})

const fileOf = (url) => path.join(coversDir, path.basename(url))

describe('cover_from_url', () => {
  it('downloads the cover after the edition is saved and points the edition at it', async () => {
    const { status, body } = await api.post('/api/books', { title: 'Shirley', author_id: 1, edition: { format: 'paperback', cover_from_url: OL_COVER } })
    assert.equal(status, 201)
    const edition = body.editions[0]
    assert.match(edition.cover_url, new RegExp(`^/covers/e${edition.id}-[0-9a-f]{8}\\.jpg$`))
    assert.equal(body.cover_url, edition.cover_url)
    assert.ok(fs.readFileSync(fileOf(edition.cover_url)).equals(jpeg))
    assert.deepEqual(requests, [OL_COVER])
  })

  it("downloads a cover from Amazon's image host, as a Claude lookup finds one", async () => {
    const amazon = 'https://m.media-amazon.com/images/I/71PoisonGarden.jpg'
    const { status, body } = await api.post('/api/books', { title: 'Shirley', author_id: 1, edition: { format: 'paperback', cover_from_url: amazon } })
    assert.equal(status, 201)
    assert.match(body.editions[0].cover_url, /^\/covers\/e\d+-[0-9a-f]{8}\.jpg$/)
    assert.deepEqual(requests, [amazon])
  })

  it('keeps the saved book and answers cover_url null when the download fails', async () => {
    upstream = () => new Response('<html>gone</html>', { status: 404, headers: { 'content-type': 'text/html' } })
    const { status, body } = await api.post('/api/books', { title: 'Shirley', author_id: 1, edition: { format: 'paperback', cover_from_url: OL_COVER } })
    assert.equal(status, 201)
    assert.equal(body.editions[0].cover_url, null)
    assert.equal(body.cover_url, null)
    assert.equal(app.db.prepare('SELECT cover FROM editions WHERE id = ?').pluck().get(body.editions[0].id), null)
    assert.deepEqual(coverFiles(coversDir), [])
    assert.deepEqual(logs, ['Cover not saved from covers.openlibrary.org: HTTP 404'])
  })

  it('refuses a URL off the allow-list without a request and stores nothing', async () => {
    for (const url of ['https://example.com/cover.jpg', 'https://covers.openlibrary.org.evil.test/x.jpg', 'http://covers.openlibrary.org/b/id/1-L.jpg', 'https://127.0.0.1/x.jpg']) {
      const { status, body } = await api.post('/api/books', { title: 'Shirley', author_id: 1, edition: { format: 'paperback', cover_from_url: url } })
      assert.deepEqual({ status, body }, { status: 400, body: { error: 'cover_from_url must be an https URL from Open Library, archive.org, Google Books, Barnes & Noble, Amazon, AbeBooks or Goodreads' } }, url)
      assert.equal((await api.post('/api/books/1/editions', { format: 'hardcover', cover_from_url: url })).status, 400, url)
    }
    assert.deepEqual(requests, [])
    assert.equal(app.db.prepare("SELECT COUNT(*) FROM books WHERE title = 'Shirley'").pluck().get(), 0)
  })

  it("saves a book's own cover for a book not owned yet", async () => {
    const { status, body } = await api.post('/api/books', { title: 'Shirley', author_id: 1, wishlist: true, cover_from_url: OL_COVER })
    assert.equal(status, 201)
    assert.match(body.cover_url, new RegExp(`^/covers/b${body.id}-[0-9a-f]{8}\\.jpg$`))
    assert.equal(app.db.prepare('SELECT cover FROM books WHERE id = ?').pluck().get(body.id), path.basename(body.cover_url))
  })

  it('downloads the cover of a purchased edition', async () => {
    const { status, body } = await api.post('/api/books/1/editions', { format: 'hardcover', isbn: '9780553212587', cover_from_url: OL_COVER })
    assert.equal(status, 201)
    assert.equal(body.wishlist, false)
    assert.match(body.editions[0].cover_url, /^\/covers\/e\d+-[0-9a-f]{8}\.jpg$/)
  })

  it('replaces an edition cover from a URL, deleting the old file only once the new one is in place', async () => {
    app.db.exec("INSERT INTO editions (id, book_id, format, cover) VALUES (5, 1, 'ebook', 'e5-0000000a.png')")
    placeCover(coversDir, 'e5-0000000a.png', PNG)
    const { status, body } = await api.patch('/api/editions/5', { cover_from_url: OL_COVER })
    assert.equal(status, 200)
    const cover = body.editions[0].cover_url
    assert.match(cover, /^\/covers\/e5-[0-9a-f]{8}\.jpg$/)
    assert.deepEqual(coverFiles(coversDir), [path.basename(cover)])
  })

  it('keeps the old cover when a replacement download fails', async () => {
    upstream = () => new Response(null, { status: 503 })
    app.db.exec("INSERT INTO editions (id, book_id, format, cover) VALUES (5, 1, 'ebook', 'e5-0000000a.png')")
    placeCover(coversDir, 'e5-0000000a.png', PNG)
    const { status, body } = await api.patch('/api/editions/5', { cover_from_url: OL_COVER })
    assert.equal(status, 200)
    assert.equal(body.editions[0].cover_url, '/covers/e5-0000000a.png')
    assert.deepEqual(coverFiles(coversDir), ['e5-0000000a.png'])
  })

  it('replaces a book cover from a URL on PATCH', async () => {
    const { status, body } = await api.patch('/api/books/1', { cover_from_url: OL_COVER })
    assert.equal(status, 200)
    assert.match(body.cover_url, /^\/covers\/b1-[0-9a-f]{8}\.jpg$/)
  })
})

// Holds every upstream answer until release(); reached resolves once the first request is in.
function holdUpstream() {
  let release
  let reached
  const released = new Promise((resolve) => (release = resolve))
  const inFlight = new Promise((resolve) => (reached = resolve))
  upstream = async () => {
    reached()
    await released
    return new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } })
  }
  return { inFlight, release }
}

describe('a cover download that finishes late', () => {
  it('leaves a book that reused the id with its own cover and file', async () => {
    const hold = holdUpstream()
    const first = api.post('/api/books', { title: 'Shirley', author_id: 1, edition: { format: 'paperback', cover_from_url: OL_COVER } })
    await hold.inFlight
    const [{ id: editionId }] = app.db.prepare('SELECT id FROM editions').all()
    assert.equal((await api.del('/api/books/2')).status, 204)
    const second = await api.post('/api/books', multipart({ title: 'Villette', author_id: 1, edition: { format: 'paperback' } }, PNG))
    const own = second.body.editions[0]
    assert.deepEqual([second.body.id, own.id], [2, editionId], 'SQLite gives out the deleted ids again')

    hold.release()
    await first
    assert.equal(app.db.prepare('SELECT cover FROM editions WHERE id = ?').pluck().get(editionId), path.basename(own.cover_url))
    assert.deepEqual(coverFiles(coversDir), [path.basename(own.cover_url)])
  })

  it('keeps a cover uploaded while the download ran', async () => {
    app.db.exec("INSERT INTO editions (id, book_id, format) VALUES (5, 1, 'paperback')")
    const hold = holdUpstream()
    const first = api.patch('/api/editions/5', { cover_from_url: OL_COVER })
    await hold.inFlight
    const upload = await api.patch('/api/editions/5', multipart({}, PNG))
    const uploaded = path.basename(upload.body.editions[0].cover_url)

    hold.release()
    assert.equal((await first).body.editions[0].cover_url, `/covers/${uploaded}`)
    assert.deepEqual(coverFiles(coversDir), [uploaded])
  })
})

describe('attachDownloadedCovers', () => {
  // Records the row as it stands, then downloads after during() has changed it.
  async function attach(table, id, during) {
    const { attachDownloadedCovers, coverDownload } = await import('../src/coverFiles.js')
    let saved
    await attachDownloadedCovers(app.db, [coverDownload(app.db, table, id, OL_COVER)], async (url, base) => {
      during()
      saved = await covers.saveCoverFromUrl(url, base, { fetch: async () => upstream(), log: () => {} })
      return saved
    })
    return saved
  }

  it('removes the downloaded file when its row was deleted during the download', async () => {
    app.db.exec("INSERT INTO editions (id, book_id, format) VALUES (9, 1, 'paperback')")
    const saved = await attach('editions', 9, () => app.db.exec('DELETE FROM editions WHERE id = 9'))
    assert.match(saved, /^e9-/)
    assert.deepEqual(coverFiles(coversDir), [])
  })

  it('tells a row that reused the id by its created_at when neither row has a cover', async () => {
    app.db.exec("INSERT INTO editions (id, book_id, format, created_at) VALUES (1, 1, 'paperback', '2026-01-01 00:00:00')")
    const saved = await attach('editions', 1, () => {
      app.db.exec('DELETE FROM editions WHERE id = 1')
      assert.equal(app.db.prepare("INSERT INTO editions (book_id, format) VALUES (1, 'hardcover')").run().lastInsertRowid, 1)
    })
    assert.match(saved, /^e1-/)
    assert.equal(app.db.prepare('SELECT cover FROM editions WHERE id = 1').pluck().get(), null)
    assert.deepEqual(coverFiles(coversDir), [])
  })
})
