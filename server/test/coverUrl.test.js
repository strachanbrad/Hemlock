/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { JPEG, PNG, loadApp, startServer } from './support/server.js'
import { client, coverFiles, emptyLibrary, placeCover } from './support/http.js'

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
  api = client(app.base)
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
      assert.deepEqual({ status, body }, { status: 400, body: { error: 'cover_from_url must be an https URL from Open Library, archive.org or Google Books' } }, url)
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

describe('attachDownloadedCovers', () => {
  it('removes the downloaded file when its row was deleted during the download', async () => {
    const { attachDownloadedCovers } = await import('../src/coverFiles.js')
    app.db.exec("INSERT INTO editions (id, book_id, format) VALUES (9, 1, 'paperback')")
    let saved
    await attachDownloadedCovers(app.db, [{ table: 'editions', id: 9, url: OL_COVER }], async (url, base) => {
      app.db.exec('DELETE FROM editions WHERE id = 9')
      saved = await covers.saveCoverFromUrl(url, base, { fetch: async () => upstream(), log: () => {} })
      return saved
    })
    assert.match(saved, /^e9-/)
    assert.deepEqual(coverFiles(coversDir), [])
  })
})
