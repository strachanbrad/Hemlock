/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { fixturesDir } from './support/fixtures.js'
import sharp from 'sharp'
import { JPEG, PNG, WEBP, dataDir, image as picture, loadApp } from './support/server.js'

const OL_COVER = 'https://covers.openlibrary.org/b/id/14839277-L.jpg'
const GOOGLE_COVER = 'https://books.google.com/books/content?id=g1&printsec=frontcover&img=1&zoom=1&source=gbs_api'
const GOOGLE_SIZED = `${GOOGLE_COVER}&fife=w1600`
const PLACEHOLDER = fs.readFileSync(path.join(fixturesDir, 'google/placeholder.png'))
const jpeg = Buffer.concat([JPEG, Buffer.alloc(4096, 7)])

let covers
before(async () => {
  covers = await loadApp()
})
after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
beforeEach(() => fs.rmSync(covers.coversDir, { recursive: true, force: true }))

const files = () => (fs.existsSync(covers.coversDir) ? fs.readdirSync(covers.coversDir) : [])
const image = (bytes, type = 'image/jpeg') => new Response(bytes, { headers: { 'content-type': type } })
const redirect = (location, status = 302) => new Response(null, { status, headers: { location } })

async function save(url, respond, { base = 'e7', timeoutMs, userAgent } = {}) {
  const calls = []
  const logs = []
  const fetch = async (target, init) => {
    calls.push({ url: target, init })
    return respond(target, init)
  }
  const result = await covers.saveCoverFromUrl(url, base, { fetch, timeoutMs, userAgent, log: (line) => logs.push(line) })
  return { result, calls, logs }
}

describe('saveCoverFromUrl', () => {
  it('saves a JPEG from Open Library under a generated edition name', async () => {
    const { result, calls, logs } = await save(OL_COVER, () => image(jpeg))
    assert.match(result, /^e7-[0-9a-f]{8}\.jpg$/)
    assert.deepEqual(files(), [result])
    assert.ok(fs.readFileSync(path.join(covers.coversDir, result)).equals(jpeg))
    assert.deepEqual(logs, [])
    assert.equal(calls.length, 1)
    assert.equal(calls[0].init.redirect, 'manual')
    assert.ok(calls[0].init.signal instanceof AbortSignal)
    assert.match(calls[0].init.headers['User-Agent'], /^Hemlock\/\S+ \(github\.com\/strachanbrad\/hemlock\)$/)
  })

  it('follows Open Library to archive.org by hand and stores the PNG it finds as a JPEG', async () => {
    const hops = {
      [OL_COVER]: () => redirect('https://archive.org/download/l_covers_0014/l_covers_0014_83.zip/0014839277-L.jpg'),
      'https://archive.org/download/l_covers_0014/l_covers_0014_83.zip/0014839277-L.jpg': () => redirect('https://ia800100.us.archive.org/view_archive.php?archive=/x.zip&file=0014839277-L.jpg', 301),
      'https://ia800100.us.archive.org/view_archive.php?archive=/x.zip&file=0014839277-L.jpg': () => image(PNG, 'image/jpeg'),
    }
    const { result, calls } = await save(OL_COVER, (url) => hops[url]())
    assert.match(result, /^e7-[0-9a-f]{8}\.jpg$/)
    assert.equal(covers.imageType(fs.readFileSync(path.join(covers.coversDir, result))), 'jpg')
    assert.equal(calls.length, 3)
    assert.ok(calls.every(({ init }) => init.redirect === 'manual'))
  })

  it("resolves a relative Location against the hop's own URL", async () => {
    const { result, calls } = await save('https://archive.org/download/a/b.jpg', (url) => (url.endsWith('/b.jpg') ? redirect('../c/d.jpg') : image(jpeg)))
    assert.match(result, /^e7-/)
    assert.equal(calls[1].url, 'https://archive.org/download/c/d.jpg')
  })

  it("saves a WebP from Google Books as a book's own cover, stored as a JPEG", async () => {
    const { result } = await save(GOOGLE_COVER, () => image(WEBP, 'image/webp'), { base: 'b12' })
    assert.match(result, /^b12-[0-9a-f]{8}\.jpg$/)
    covers.deleteCover(result)
    assert.deepEqual(files(), [])
  })

  it('stores a large download at 1600 px on its long side', async () => {
    const amazon = await picture({ width: 2000, height: 3000 }).jpeg().toBuffer()
    const { result, logs } = await save('https://m.media-amazon.com/images/I/81abc.jpg', () => image(amazon))
    assert.deepEqual(logs, [])
    const { width, height } = await sharp(path.join(covers.coversDir, result)).metadata()
    assert.deepEqual({ width, height }, { width: 1067, height: 1600 })
  })

  describe("Google's sized cover", () => {
    const sized = (page, thumbnail) => (url) => (new URL(url).searchParams.has('fife') ? image(page, 'image/png') : image(thumbnail))

    it('falls back to the thumbnail when the sized request answers a scanned page, a PNG', async () => {
      const page = await picture({ width: 300, height: 463 }).png({ palette: true }).toBuffer()
      const thumbnail = await picture({ width: 128, height: 196 }).jpeg().toBuffer()
      const { result, calls, logs } = await save(GOOGLE_SIZED, sized(page, thumbnail))
      assert.deepEqual(calls.map(({ url }) => url), [GOOGLE_SIZED, GOOGLE_COVER])
      assert.ok(fs.readFileSync(path.join(covers.coversDir, result)).equals(thumbnail))
      assert.deepEqual(logs, [])
    })

    it('keeps a JPEG answer, and a PNG from another host or without fife, asking once', async () => {
      const large = await picture({ width: 1000, height: 1500 }).jpeg().toBuffer()
      const google = await save(GOOGLE_SIZED, () => image(large))
      assert.equal(google.calls.length, 1)
      assert.ok(fs.readFileSync(path.join(covers.coversDir, google.result)).equals(large))
      for (const url of ['https://archive.org/x.png?fife=w1600', GOOGLE_COVER]) {
        const png = await save(url, () => image(PNG, 'image/png'))
        assert.equal(png.calls.length, 1, url)
        assert.match(png.result, /^e7-/, url)
      }
    })

    it("refuses Google's placeholder without asking again", async () => {
      const { result, calls, logs } = await save(GOOGLE_SIZED, sized(PLACEHOLDER, JPEG))
      assert.equal(result, null)
      assert.equal(calls.length, 1)
      assert.deepEqual(logs, ["Cover not saved from books.google.com: Google's image-not-available placeholder"])
    })

    it('bounds both requests by one timeout', async () => {
      const page = await picture({ width: 300, height: 463 }).png().toBuffer()
      const slow = (url, init) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(new URL(url).searchParams.has('fife') ? image(page, 'image/png') : image(JPEG)), 40)
        init.signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(init.signal.reason)
        })
      })
      const { result, calls, logs } = await save(GOOGLE_SIZED, slow, { timeoutMs: 60 })
      assert.equal(result, null)
      assert.equal(calls.length, 2)
      assert.deepEqual(logs, ['Cover not saved from books.google.com: no answer in 60 ms'])
    })
  })

  const refusals = [
    ['an HTML page behind a .jpg URL', OL_COVER, () => new Response('<html>not found</html>', { headers: { 'content-type': 'text/html' } }), /not a JPEG, PNG or WebP/],
    ["Google's image-not-available placeholder", GOOGLE_COVER, () => image(PLACEHOLDER, 'image/png'), /placeholder/],
    ['an error status', OL_COVER, () => new Response('', { status: 404 }), /HTTP 404/],
    ['a network error', OL_COVER, () => Promise.reject(new TypeError('fetch failed')), /fetch failed/],
    ['a redirect without a Location', OL_COVER, () => new Response(null, { status: 302 }), /redirect without a Location/],
    ['a redirect to plain http on an allowed host', OL_COVER, () => redirect('http://archive.org/download/x.jpg'), /off the allow-list: http:\/\/archive\.org/],
    ['a JPEG cut short', OL_COVER, () => image(JPEG.subarray(0, JPEG.length - 40)), /could not be read as an image/],
    ['a Content-Length over 10 MB', OL_COVER, () => new Response(JPEG, { headers: { 'content-type': 'image/jpeg', 'content-length': String(10 * 1024 * 1024 + 1) } }), /larger than 10 MB/],
  ]

  for (const [name, url, respond, reason] of refusals) {
    it(`gives null, one log line and no file for ${name}`, async () => {
      const { result, logs } = await save(url, respond)
      assert.equal(result, null)
      assert.equal(logs.length, 1, logs.join('\n'))
      assert.match(logs[0], reason)
      assert.deepEqual(files(), [])
    })
  }

  it('follows at most three redirects', async () => {
    const chain = (redirects) => (url) => {
      const n = Number(new URL(url).searchParams.get('n') ?? 0)
      return n < redirects ? redirect(`https://archive.org/x.jpg?n=${n + 1}`) : image(jpeg)
    }
    const three = await save(OL_COVER, chain(3))
    assert.match(three.result, /^e7-/)
    assert.equal(three.calls.length, 4)
    fs.rmSync(covers.coversDir, { recursive: true, force: true })

    const four = await save(OL_COVER, chain(4))
    assert.equal(four.result, null)
    assert.equal(four.calls.length, 4)
    assert.deepEqual(four.logs, ['Cover not saved from covers.openlibrary.org: more than 3 redirects'])
    assert.deepEqual(files(), [])
  })

  it('stops reading a body without Content-Length once it passes 10 MB', async () => {
    let pulls = 0
    let cancelled = false
    const body = new ReadableStream({
      // A JPEG of 12 MB in 1 MB chunks: whole, it would pass every other check.
      pull(controller) {
        pulls++
        if (pulls > 13) return controller.close()
        controller.enqueue(pulls === 1 ? new Uint8Array(jpeg) : new Uint8Array(1024 * 1024))
      },
      cancel() {
        cancelled = true
      },
    })
    const { result, logs } = await save('https://ia800100.us.archive.org/x.jpg', () => new Response(body, { headers: { 'content-type': 'image/jpeg' } }))
    assert.equal(result, null)
    assert.deepEqual(logs, ['Cover not saved from ia800100.us.archive.org: larger than 10 MB'])
    assert.ok(cancelled, 'the stream is cancelled')
    assert.ok(pulls <= 12, `${pulls} chunks read`)
    assert.deepEqual(files(), [])
  })

  it('never fetches the next hop of a redirect off the allow-list', async () => {
    const { result, calls, logs } = await save(OL_COVER, () => redirect('https://127.0.0.1:5000/api/health'))
    assert.equal(result, null)
    assert.equal(calls.length, 1)
    assert.match(logs[0], /redirected to a URL off the allow-list/)
  })

  it('never fetches a URL that is not https on an allowed host', async () => {
    const urls = [
      'http://covers.openlibrary.org/b/id/1-L.jpg',
      'https://covers.openlibrary.org.evil.example/b/id/1-L.jpg',
      'https://evilarchive.org/x.jpg',
      'https://archive.org.evil.example/x.jpg',
      'https://user@covers.openlibrary.org/b/id/1-L.jpg',
      'https://covers.openlibrary.org:8443/b/id/1-L.jpg',
      'https://127.0.0.1/covers/x.jpg',
      'https://localhost/x.jpg',
      'https://books.google.co.uk/books/content?id=g1',
      'file:///etc/passwd',
      'not a url',
      '',
    ]
    for (const url of urls) {
      const { result, calls, logs } = await save(url, () => image(jpeg))
      assert.equal(result, null, url)
      assert.equal(calls.length, 0, url)
      assert.equal(logs.length, 1, url)
    }
    assert.deepEqual(files(), [])
  })

  it('accepts every archive.org host and no other', () => {
    for (const url of ['https://archive.org/x.jpg', 'https://ia800100.us.archive.org/x.jpg', 'https://ARCHIVE.org/x.jpg', OL_COVER, GOOGLE_COVER]) {
      assert.ok(covers.allowedCoverUrl(url), url)
    }
    assert.equal(covers.allowedCoverUrl('https://openlibrary.org/b/id/1-L.jpg'), null)
    assert.equal(covers.allowedCoverUrl('https://www.googleapis.com/books/v1/volumes'), null)
  })

  it("accepts Amazon's and Goodreads' image hosts and no other host of theirs", () => {
    const allowed = [
      'https://m.media-amazon.com/images/I/81abc.jpg',
      'https://images-na.ssl-images-amazon.com/images/I/51abc.jpg',
      'https://ecx.images-amazon.com/images/I/51abc.jpg',
      'https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1/1.jpg',
      'https://images.gr-assets.com/books/1/1.jpg',
    ]
    for (const url of allowed) assert.ok(covers.allowedCoverUrl(url), url)
    const refused = [
      'https://www.amazon.com/dp/1969253096',
      'https://images-amazon.com/x.jpg',
      'https://evilimages-amazon.com/x.jpg',
      'https://m.media-amazon.com.evil.test/x.jpg',
      'https://www.goodreads.com/book/show/1',
      'https://s.gr-assets.com/x.jpg',
      'http://m.media-amazon.com/images/I/81abc.jpg',
    ]
    for (const url of refused) assert.equal(covers.allowedCoverUrl(url), null, url)
  })

  it('sends the User-Agent it is given', async () => {
    const { calls } = await save(OL_COVER, () => image(jpeg), { userAgent: 'Hemlock/test (contact@example.org)' })
    assert.equal(calls[0].init.headers['User-Agent'], 'Hemlock/test (contact@example.org)')
  })

  it('gives up when the download takes longer than its timeout', async () => {
    const { result, logs } = await save(
      OL_COVER,
      (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
      { timeoutMs: 20 },
    )
    assert.equal(result, null)
    assert.deepEqual(logs, ['Cover not saved from covers.openlibrary.org: no answer in 20 ms'])
  })

  it('throws for a base that is not e<edition id> or b<book id>, before any request', async () => {
    for (const base of [7, 0, '12', 'x12', 'e0', 'e-1', 'e1.5', '../e1', 'b12/..', null]) {
      await assert.rejects(save(OL_COVER, () => image(jpeg), { base }), TypeError, String(base))
    }
    assert.deepEqual(files(), [])
  })
})
