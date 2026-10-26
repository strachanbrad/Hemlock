/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import sharp from 'sharp'
import { image, loadApp, startServer } from './support/server.js'
import { client, coverFiles, emptyLibrary, placeCover } from './support/http.js'

const KEY = 'sk-ant-test-SECRET-0123456789abcdef'
const AMAZON = 'https://m.media-amazon.com/images/I/71PoisonGardenL.jpg'
// Stage one's three covers by ISBN, for book 1's ISBN.
const FREE = {
  barnes_noble: 'https://cdn.shopify.com/s/files/1/0674/5433/7265/files/9781969253096_p0.jpg',
  amazon: 'https://images-na.ssl-images-amazon.com/images/P/1969253096.01.LZZZZZZZ.jpg',
  open_library: 'https://covers.openlibrary.org/b/isbn/9781969253096-L.jpg',
}
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64')
const dir = path.join(import.meta.dirname, 'fixtures/anthropic')
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'))
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } })
const jpeg = (width, height) => image({ width, height }).jpeg().toBuffer()

const reportWith = (input) => {
  const answer = fixture('report-cover')
  Object.assign(answer.content.find((block) => block.type === 'tool_use').input, input)
  return json(answer)
}

// Each test sets what Claude answers (`script`, fixture names or Responses) and what the image host serves.
let script
let images
let key
let beforeAnswer
const claudeRequests = []
const downloads = []
const stageTwo = () => downloads.filter((url) => !Object.values(FREE).includes(url))
const logs = []
const published = []

async function claudeFetch(url, init) {
  claudeRequests.push(JSON.parse(init.body))
  const next = script.shift()
  if (next === undefined) throw new Error('the test script has no more answers')
  return typeof next === 'string' ? json(fixture(next)) : next
}

async function imageFetch(url) {
  downloads.push(url)
  await beforeAnswer()
  return images[url] ? new Response(images[url], { headers: { 'content-type': 'image/jpeg' } }) : new Response('', { status: 404 })
}

let app
let api
let coversDir
before(async () => {
  const covers = await loadApp()
  const { createCoverFinder } = await import('../src/coverFinder.js')
  coversDir = covers.coversDir
  app = await startServer((db) => {
    const saveCover = (url, base) => covers.saveCoverFromUrl(url, base, { fetch: imageFetch, log: (line) => logs.push(line) })
    const events = { handler: (req, res) => res.end(), changes: (req, res) => res.end(), publish: (kind) => published.push(kind) }
    return { saveCover, events, findCover: createCoverFinder({ db, apiKey: () => key, saveCover, fetch: claudeFetch, log: (line) => logs.push(line) }) }
  })
  api = client(app.base, app.cookie)
})
after(() => app.close())

// Book 1 shows its paperback's cover (edition 11, picked before the hardcover without one, whose ISBN
// comes first among its editions); book 2 has no editions and no cover.
beforeEach(async () => {
  emptyLibrary(app.db, coversDir)
  script = []
  images = {}
  key = KEY
  beforeAnswer = async () => {}
  for (const list of [claudeRequests, downloads, logs, published]) list.length = 0
  app.db.exec(`
    INSERT INTO authors (id, name) VALUES (1, 'Iris Vane');
    INSERT INTO books (id, title, author_id) VALUES (1, 'The Poison Garden', 1), (2, 'Ledger of the Dead', 1);
    INSERT INTO editions (id, book_id, format, isbn, cover) VALUES (10, 1, 'hardcover', '9780141439686', NULL), (11, 1, 'paperback', '9781969253096', 'e11-0000000a.jpg');
  `)
  placeCover(coversDir, 'e11-0000000a.jpg', await jpeg(128, 198))
})

const find = (id) => api.post(`/api/books/${id}/cover/find`)
const size = async (url) => {
  const { width, height } = await sharp(path.join(coversDir, path.basename(url))).metadata()
  return { width, height }
}

describe('POST /api/books/:id/cover/find, stage one', () => {
  it("keeps the widest free cover by ISBN when it is wider, deletes the others and asks Claude nothing, even without a key", async () => {
    key = null
    images[FREE.barnes_noble] = await jpeg(876, 1356)
    images[FREE.amazon] = await jpeg(324, 500)
    images[FREE.open_library] = await jpeg(333, 500)
    const { status, body } = await find(1)
    assert.equal(status, 200)
    assert.deepEqual({ ...body, book: undefined }, { replaced: true, book: undefined, source: 'barnes_noble', source_url: null, width: 876, height: 1356 })
    const edition = body.book.editions.find((e) => e.id === 11)
    assert.match(edition.cover_url, /^\/covers\/e11-[0-9a-f]{8}\.jpg$/)
    assert.deepEqual(await size(edition.cover_url), { width: 876, height: 1356 })
    assert.deepEqual(coverFiles(coversDir), [path.basename(edition.cover_url)])
    assert.deepEqual(downloads.sort(), Object.values(FREE).sort())
    assert.equal(claudeRequests.length, 0)
    assert.deepEqual(published, ['library'])
  })

  it("ignores Amazon's 1x1 GIF and a source without the book, and takes what is left", async () => {
    images[FREE.amazon] = GIF
    images[FREE.open_library] = await jpeg(333, 500)
    const { body } = await find(1)
    assert.deepEqual([body.replaced, body.source, body.width], [true, 'open_library', 333])
    assert.equal(coverFiles(coversDir).length, 1)
    assert.ok(logs.some((line) => /images-na\.ssl-images-amazon\.com: not a JPEG, PNG or WebP image/.test(line)), logs.join('\n'))
    assert.equal(claudeRequests.length, 0)
  })

  it('takes the widest free cover wherever it comes in the order', async () => {
    images[FREE.amazon] = await jpeg(324, 500)
    images[FREE.open_library] = await jpeg(333, 500)
    const { body } = await find(1)
    assert.deepEqual([body.replaced, body.source, body.width], [true, 'open_library', 333])
    assert.equal(coverFiles(coversDir).length, 1)
  })

  it('goes on to Claude when nothing free is wider, and deletes the free downloads', async () => {
    placeCover(coversDir, 'e11-0000000a.jpg', await jpeg(500, 750))
    images[FREE.amazon] = await jpeg(324, 500)
    images[FREE.open_library] = await jpeg(333, 500)
    script = ['report-cover']
    images[AMAZON] = await jpeg(900, 1350)
    const { body } = await find(1)
    assert.deepEqual([body.replaced, body.source, body.width], [true, 'claude', 900])
    assert.equal(claudeRequests.length, 1)
    assert.deepEqual(coverFiles(coversDir), [path.basename(body.book.cover_url)])
  })

  it('answers 503 without a key when nothing free is wider, an equal width included, leaving no file', async () => {
    key = null
    placeCover(coversDir, 'e11-0000000a.jpg', await jpeg(333, 500))
    images[FREE.open_library] = await jpeg(333, 500)
    assert.deepEqual(await find(1), { status: 503, body: { error: 'Claude is not configured' } })
    assert.deepEqual(coverFiles(coversDir), ['e11-0000000a.jpg'])
  })

  it('keeps the cover when neither stage finds a wider one, naming the widest found', async () => {
    placeCover(coversDir, 'e11-0000000a.jpg', await jpeg(500, 750))
    images[FREE.open_library] = await jpeg(333, 500)
    script = ['cover-not-found']
    const { status, body } = await find(1)
    assert.equal(status, 200)
    assert.deepEqual({ ...body, book: undefined }, { replaced: false, book: undefined, source: 'open_library', source_url: null, width: 333, height: 500 })
    assert.deepEqual(coverFiles(coversDir), ['e11-0000000a.jpg'])
  })

  it('skips stage one for a book without an ISBN', async () => {
    script = ['cover-not-found']
    assert.deepEqual(await find(2), { status: 404, body: { error: 'No cover found for this book' } })
    assert.deepEqual(downloads, [])
  })
})

describe('POST /api/books/:id/cover/find', () => {
  it("replaces a narrower cover on the picked edition, from the Amazon original, and deletes the old file", async () => {
    script = ['report-cover']
    images[AMAZON] = await jpeg(600, 900)
    const { status, body } = await find(1)
    assert.equal(status, 200)
    assert.deepEqual({ ...body, book: undefined }, { replaced: true, book: undefined, source: 'claude', source_url: 'https://www.amazon.com/dp/1969253096', width: 600, height: 900 })
    const edition = body.book.editions.find((e) => e.id === 11)
    assert.match(edition.cover_url, /^\/covers\/e11-[0-9a-f]{8}\.jpg$/)
    assert.equal(body.book.cover_url, edition.cover_url)
    assert.deepEqual(await size(edition.cover_url), { width: 600, height: 900 })
    assert.deepEqual(coverFiles(coversDir), [path.basename(edition.cover_url)])
    assert.deepEqual(downloads.sort(), [...Object.values(FREE), AMAZON].sort())

    const [request] = claudeRequests
    assert.equal(claudeRequests.length, 1)
    assert.deepEqual(request.messages, [{ role: 'user', content: 'Find the largest cover image of the book with ISBN-13 9781969253096 (ISBN-10 1969253096) and report it with report_cover.' }])
    assert.deepEqual(request.tools.slice(0, 2), [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 5 }])
    assert.equal(request.tools[2].name, 'report_cover')
    assert.deepEqual(request.tools[2].input_schema.required, ['found', 'cover_url', 'source_url', 'isbn_on_listing'])
    for (const rule of [
      /Search once for the ISBN-13 as a quoted string/,
      /once for the exact title and author only when that finds no listing/,
      /Open a listing of this exact edition with web_fetch, and only at a URL that appeared in a search result/,
      /Amazon, Goodreads and Bookshop\.org pages cannot be opened, so do not try them/,
      /Barnes & Noble, AbeBooks, Google Books, the publisher's and the author's pages can be opened/,
      /og:image or its main cover image, exactly as the page gives it/,
      /Never report the cover of another edition/,
    ]) assert.match(request.system, rule)
  })

  it('keeps a cover at least as wide as the one found and leaves no file behind', async () => {
    placeCover(coversDir, 'e11-0000000a.jpg', await jpeg(600, 900))
    for (const width of [300, 600]) {
      script = ['report-cover']
      images[AMAZON] = await jpeg(width, width * 1.5)
      const { status, body } = await find(1)
      assert.equal(status, 200, String(width))
      assert.deepEqual([body.replaced, body.width, body.height, body.book.cover_url], [false, width, width * 1.5, '/covers/e11-0000000a.jpg'])
      assert.deepEqual(coverFiles(coversDir), ['e11-0000000a.jpg'])
    }
  })

  it('stores on the book itself when it has no editions, asking by title and author', async () => {
    script = ['report-cover']
    images[AMAZON] = await jpeg(600, 900)
    const { status, body } = await find(2)
    assert.equal(status, 200)
    assert.equal(body.replaced, true)
    assert.match(body.book.cover_url, /^\/covers\/b2-[0-9a-f]{8}\.jpg$/)
    assert.equal(app.db.prepare('SELECT cover FROM books WHERE id = 2').pluck().get(), path.basename(body.book.cover_url))
    assert.equal(claudeRequests[0].messages[0].content, 'Find the largest cover image of “Ledger of the Dead” by Iris Vane, which has no ISBN in the catalogue, and report it with report_cover.')
  })

  it("replaces the book's own cover and deletes it after the commit", async () => {
    app.db.exec("UPDATE books SET cover = 'b2-0000000b.jpg' WHERE id = 2")
    placeCover(coversDir, 'b2-0000000b.jpg', await jpeg(100, 150))
    script = [reportWith({ isbn_on_listing: null })]
    images[AMAZON] = await jpeg(600, 900)
    const { body } = await find(2)
    assert.equal(body.replaced, true)
    assert.ok(!coverFiles(coversDir).includes('b2-0000000b.jpg'))
  })

  it("asks by another edition's ISBN when the picked edition has none, and stores on the picked edition", async () => {
    app.db.exec(`
      INSERT INTO books (id, title, author_id) VALUES (3, 'Third', 1);
      INSERT INTO editions (id, book_id, format, isbn, cover) VALUES (20, 3, 'hardcover', NULL, 'e20-0000000c.jpg'), (21, 3, 'ebook', '9780553212587', NULL);
    `)
    placeCover(coversDir, 'e20-0000000c.jpg', await jpeg(128, 198))
    script = [reportWith({ isbn_on_listing: '0553212583' })]
    images[AMAZON] = await jpeg(600, 900)
    const { status, body } = await find(3)
    assert.equal(status, 200)
    assert.match(claudeRequests[0].messages[0].content, /ISBN-13 9780553212587 \(ISBN-10 0553212583\)/)
    assert.match(body.book.editions.find((e) => e.id === 20).cover_url, /^\/covers\/e20-[0-9a-f]{8}\.jpg$/)
    assert.equal(body.book.editions.find((e) => e.id === 21).cover_url, null)
  })

  it('measures the current cover as shown, after the EXIF orientation of a file stored before covers were turned upright', async () => {
    placeCover(coversDir, 'e11-0000000a.jpg', await image({ width: 300, height: 200 }).jpeg().withMetadata({ orientation: 6 }).toBuffer())
    script = ['report-cover']
    images[AMAZON] = await jpeg(250, 375)
    const { body } = await find(1)
    assert.equal(body.replaced, true)
  })

  it('counts a cover whose file is missing as no cover', async () => {
    fs.rmSync(path.join(coversDir, 'e11-0000000a.jpg'))
    script = ['report-cover']
    images[AMAZON] = await jpeg(200, 300)
    const { body } = await find(1)
    assert.equal(body.replaced, true)
  })

  it('answers 404 when Claude finds no cover, and downloads nothing', async () => {
    script = ['cover-not-found']
    assert.deepEqual(await find(1), { status: 404, body: { error: 'No cover found for this book' } })
    assert.deepEqual(stageTwo(), [])
  })

  it('answers 404 for a cover off the allow-list or a listing of another ISBN, and downloads nothing', async () => {
    for (const input of [{ cover_url: 'https://www.amazon.com/images/cover.jpg' }, { cover_url: 'http://m.media-amazon.com/images/I/1.jpg' }, { isbn_on_listing: '9781969253102' }]) {
      script = [reportWith(input)]
      assert.deepEqual(await find(1), { status: 404, body: { error: 'No cover found for this book' } }, JSON.stringify(input))
    }
    assert.deepEqual(stageTwo(), [])
    assert.deepEqual(coverFiles(coversDir), ['e11-0000000a.jpg'])
  })

  it('answers 503 without a key and 404 for an unknown book, before asking Claude', async () => {
    key = null
    assert.deepEqual(await find(1), { status: 503, body: { error: 'Claude is not configured' } })
    key = KEY
    assert.deepEqual(await find(99), { status: 404, body: { error: 'Book not found' } })
    assert.equal(claudeRequests.length, 0)
  })

  it('answers 502 when the search or the download fails, and keeps the cover', async () => {
    script = [json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 529)]
    assert.deepEqual(await find(1), { status: 502, body: { error: 'The cover search failed: Anthropic answered HTTP 529: Overloaded' } })
    script = ['report-cover']
    assert.deepEqual(await find(1), { status: 502, body: { error: 'The cover Claude found could not be downloaded from m.media-amazon.com' } })
    assert.deepEqual(coverFiles(coversDir), ['e11-0000000a.jpg'])
    assert.ok(!JSON.stringify(logs).includes(KEY))
  })

  it('shares one search between two presses for the same book', async () => {
    script = ['report-cover']
    images[AMAZON] = await jpeg(600, 900)
    const [first, second] = await Promise.all([find(1), find(1)])
    assert.equal(claudeRequests.length, 1)
    assert.deepEqual(stageTwo(), [AMAZON])
    assert.equal(downloads.length, 4)
    assert.deepEqual(first, second)
    assert.equal(first.body.replaced, true)
    assert.equal(coverFiles(coversDir).length, 1)
  })

  it('answers 409, keeps the cover given meanwhile and leaves no file when the cover changes during the search', async () => {
    script = ['report-cover']
    images[AMAZON] = await jpeg(600, 900)
    beforeAnswer = async () => {
      placeCover(coversDir, 'e11-0000000d.jpg', await jpeg(300, 450))
      app.db.exec("UPDATE editions SET cover = 'e11-0000000d.jpg' WHERE id = 11")
    }
    assert.deepEqual(await find(1), { status: 409, body: { error: 'The cover changed during the search; try again' } })
    assert.equal(app.db.prepare('SELECT cover FROM editions WHERE id = 11').pluck().get(), 'e11-0000000d.jpg')
    assert.deepEqual(coverFiles(coversDir), ['e11-0000000a.jpg', 'e11-0000000d.jpg'])
  })

  it('answers 409 when the slot the cover would go to changes during the search, though the shown cover does not', async () => {
    script = [reportWith({ isbn_on_listing: null })]
    images[AMAZON] = await jpeg(600, 900)
    beforeAnswer = async () => app.db.exec("INSERT INTO editions (id, book_id, format) VALUES (30, 2, 'paperback')")
    assert.deepEqual(await find(2), { status: 409, body: { error: 'The cover changed during the search; try again' } })
    assert.deepEqual(app.db.prepare('SELECT cover FROM books WHERE id = 2 UNION ALL SELECT cover FROM editions WHERE id = 30').pluck().all(), [null, null])
    assert.deepEqual(coverFiles(coversDir), ['e11-0000000a.jpg'])
  })

  it('answers 404 and leaves no file when the book is deleted during the search', async () => {
    script = ['report-cover']
    images[AMAZON] = await jpeg(600, 900)
    beforeAnswer = async () => app.db.exec('DELETE FROM books WHERE id = 1')
    assert.deepEqual(await find(1), { status: 404, body: { error: 'Book not found' } })
    assert.deepEqual(coverFiles(coversDir), ['e11-0000000a.jpg'])
  })
})
