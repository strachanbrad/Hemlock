/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it, mock } from 'node:test'
import { loadConfig } from '../src/config.js'
import { createLimiter } from '../src/lookup/limiter.js'
import { CACHE_MS, createLookup } from '../src/lookup/index.js'
import { dataDir, loadApp, signIn } from './support/server.js'
import { fixtureFetch, instantClock, json, readFixture } from './support/fixtures.js'

const version = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../package.json'), 'utf8')).version
const WUTHERING = '9780553212587'
const ROSALIND = '9798322853480'
const FIFTY = '9780345803481'

const SEARCH = 'https://openlibrary.org/search.json'
const isSearch = (url) => url.startsWith(SEARCH)
const isGoogle = (url) => url.startsWith('https://www.googleapis.com/') || url.startsWith('https://books.google.com/')
const paths = (calls) => calls.map(({ url }) => (isGoogle(url) ? 'google' : new URL(url).pathname))

function setup({ answer, probe, googleKey = null, contact = null, timeoutMs } = {}) {
  const clock = instantClock(1_000_000)
  const logs = []
  const { fetch, calls, probes } = fixtureFetch({ answer, probe, now: clock.now })
  const lookup = createLookup({ fetch, googleKey, contact, now: clock.now, sleep: clock.sleep, timeoutMs, log: (line) => logs.push(line) })
  return { lookup, calls, probes, logs, clock }
}

describe('lookup with Open Library only', () => {
  it('finds Wuthering Heights with two requests, the edition holding the description', async () => {
    const { lookup, calls } = setup()
    const { status, body } = await lookup(WUTHERING)
    assert.equal(status, 200)
    assert.deepEqual(paths(calls), ['/search.json', '/books/OL7820421M.json'])
    assert.deepEqual({ ...body, synopsis: body.synopsis.slice(0, 30) }, {
      isbn: WUTHERING,
      title: 'Wuthering Heights',
      authors: ['Emily Brontë'],
      publisher: 'Bantam Books',
      published: '1981-03',
      synopsis: '"My greatest thought in living',
      format: 'paperback',
      cover_url: 'https://covers.openlibrary.org/b/id/14839277-L.jpg',
      sources: {
        google: 'disabled',
        open_library: 'ok',
        fields: { title: 'open_library', authors: 'open_library', publisher: 'open_library', published: 'open_library', synopsis: 'open_library', format: 'open_library', cover_url: 'open_library' },
        anthropic: 'disabled',
      },
    })
  })

  it('asks search, then the edition, then the work, without redirects, as an identified client', async () => {
    const { lookup, calls } = setup()
    await lookup(ROSALIND)
    assert.deepEqual(paths(calls), ['/search.json', '/books/OL52466785M.json', '/works/OL38557616W.json'])
    const search = new URL(calls[0].url)
    assert.equal(search.searchParams.get('q'), `isbn:${ROSALIND}`)
    assert.match(search.searchParams.get('fields'), /^key,title,author_name,cover_i,editions,/)
    for (const { init } of calls) {
      assert.equal(init.headers['User-Agent'], `Hemlock/${version} (github.com/strachanbrad/hemlock)`)
      assert.equal(init.redirect, 'manual')
      assert.ok(init.signal instanceof AbortSignal)
    }
  })

  it('trims the title, keeps the year of an ambiguous date and takes the work cover and description', async () => {
    const { body } = await setup().lookup(ROSALIND)
    assert.equal(body.title, 'Breaking Rosalind')
    assert.equal(body.published, '2024')
    assert.equal(body.cover_url, 'https://covers.openlibrary.org/b/id/15139497-L.jpg')
    assert.equal(body.sources.fields.cover_url, 'open_library_work')
    assert.equal(body.sources.fields.synopsis, 'open_library_work')
    assert.match(body.synopsis, /^\*\*I wove a deadly web/)
    assert.ok(!body.synopsis.includes('\r'))
    assert.equal(body.format, null)
  })

  it('reads a work description given as a plain string', async () => {
    const { body } = await setup().lookup(FIFTY)
    assert.match(body.synopsis, /^When literature student Anastasia Steele/)
    assert.equal(body.sources.fields.synopsis, 'open_library_work')
  })

  it('uses only the work when the search edition does not carry the ISBN', async () => {
    const search = readFixture(`openlibrary/search-${WUTHERING}.json`)
    search.docs[0].editions.docs[0].isbn = ['9780141439556']
    const { lookup, calls } = setup({ answer: (url) => (isSearch(url) ? json(search) : undefined) })
    const { status, body } = await lookup(WUTHERING)
    assert.equal(status, 200)
    assert.deepEqual(paths(calls), ['/search.json', '/works/OL21177W.json'])
    assert.equal(body.title, 'Wuthering Heights')
    assert.equal(body.sources.fields.title, 'open_library_work')
    assert.equal(body.publisher, null)
  })

  it('never requests a key that is not an Open Library edition or work id', async () => {
    const search = readFixture(`openlibrary/search-${WUTHERING}.json`)
    search.docs[0].key = '/works/../../admin'
    search.docs[0].editions.docs[0].key = 'https://evil.example/books/OL1M'
    const { lookup, calls } = setup({ answer: (url) => (isSearch(url) ? json(search) : undefined) })
    const { status, body } = await lookup(WUTHERING)
    assert.equal(status, 200)
    assert.deepEqual(paths(calls), ['/search.json'])
    assert.equal(body.title, 'Wuthering Heights')
  })

  it('treats a merged record as missing instead of following it', async () => {
    const { lookup, calls } = setup({
      answer: (url) => (url.includes('/books/') ? json({ type: { key: '/type/redirect' }, location: '/books/OL2M', description: 'stale' }) : undefined),
    })
    const { status, body } = await lookup(WUTHERING)
    assert.equal(status, 200)
    assert.deepEqual(paths(calls), ['/search.json', '/books/OL7820421M.json', '/works/OL21177W.json'])
    assert.equal(body.format, null)
    assert.equal(body.cover_url, 'https://covers.openlibrary.org/b/id/14839277-L.jpg')
  })

  it('answers 404 when the search finds nothing', async () => {
    const { lookup, calls } = setup({ answer: (url) => (isSearch(url) ? json({ numFound: 0, docs: [] }) : undefined) })
    const result = await lookup('9781501120688')
    assert.equal(result.status, 404)
    assert.deepEqual(result.body, { error: 'No book source knows ISBN 9781501120688', sources: { google: 'disabled', open_library: 'not_found', anthropic: 'disabled' } })
    assert.equal(calls.length, 1)
  })
})

describe('lookup failures', () => {
  it('retries a 5xx once and succeeds', async () => {
    let first = true
    const { lookup, calls } = setup({
      answer: (url) => {
        if (isSearch(url) && first) {
          first = false
          return json({ error: 'busy' }, 503)
        }
      },
    })
    assert.equal((await lookup(WUTHERING)).status, 200)
    assert.deepEqual(paths(calls), ['/search.json', '/search.json', '/books/OL7820421M.json'])
    assert.ok(calls[1].at - calls[0].at >= 1000, 'the retry waits for its limiter slot')
  })

  it('retries a network error once and then reports 502', async () => {
    const { lookup, calls, logs } = setup({
      answer: () => {
        throw new TypeError('fetch failed')
      },
    })
    const result = await lookup(WUTHERING)
    assert.equal(result.status, 502)
    assert.deepEqual(result.body, { error: 'No book source answered; try again later', sources: { google: 'disabled', open_library: 'failed', anthropic: 'disabled' } })
    assert.equal(calls.length, 2)
    assert.deepEqual(logs, ['Open Library /search.json: fetch failed'])
  })

  it('reports a failed edition request as a failed source', async () => {
    const { lookup, calls } = setup({ answer: (url) => (url.includes('/books/') ? json({}, 500) : undefined) })
    assert.equal((await lookup(WUTHERING)).status, 502)
    assert.deepEqual(paths(calls), ['/search.json', '/books/OL7820421M.json', '/books/OL7820421M.json'])
  })

  it('answers without the synopsis, marked failed, when only the work request fails', async () => {
    const { lookup, calls } = setup({ answer: (url) => (url.includes('/works/') ? json({}, 500) : undefined) })
    const { status, body } = await lookup(ROSALIND)
    assert.equal(status, 200)
    assert.deepEqual(paths(calls), ['/search.json', '/books/OL52466785M.json', '/works/OL38557616W.json', '/works/OL38557616W.json'])
    assert.equal(body.title, 'Breaking Rosalind')
    assert.deepEqual(body.authors, ['Gigi Styx'])
    assert.equal(body.cover_url, 'https://covers.openlibrary.org/b/id/15139497-L.jpg')
    assert.equal(body.synopsis, null)
    assert.equal(body.sources.open_library, 'ok')
    assert.equal(body.sources.fields.synopsis, 'failed')
  })

  it('does not retry a 4xx', async () => {
    const { lookup, calls } = setup({ answer: (url) => (isSearch(url) ? json({}, 400) : undefined) })
    assert.equal((await lookup(WUTHERING)).status, 502)
    assert.equal(calls.length, 1)
  })

  it('pauses Open Library after a 429 without sending anything until the pause ends', async () => {
    let refuse = true
    const { lookup, calls, logs, clock } = setup({ answer: (url) => (refuse && isSearch(url) ? json({}, 429, { 'retry-after': '30' }) : undefined) })
    assert.equal((await lookup(WUTHERING)).status, 502)
    assert.equal(calls.length, 1)
    refuse = false
    assert.equal((await lookup(ROSALIND)).status, 502)
    assert.equal(calls.length, 1, 'nothing sent while paused')
    assert.match(logs.at(-1), /not sent, paused/)
    clock.advance(30_000)
    assert.equal((await lookup(ROSALIND)).status, 200)
  })

  it('pauses for a minute after a 403 without Retry-After', async () => {
    let refuse = true
    const { lookup, calls, clock } = setup({ answer: (url) => (refuse && isSearch(url) ? json({}, 403) : undefined) })
    await lookup(WUTHERING)
    refuse = false
    clock.advance(59_000)
    assert.equal((await lookup(WUTHERING)).status, 502)
    clock.advance(1_000)
    assert.equal((await lookup(WUTHERING)).status, 200)
    assert.equal(calls.filter(({ url }) => isSearch(url)).length, 2)
  })

  it('gives up on a request that does not answer within the timeout', async () => {
    const { lookup, calls, logs } = setup({
      timeoutMs: 20,
      answer: (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
    })
    const result = await lookup(WUTHERING)
    assert.equal(result.status, 502)
    assert.equal(calls.length, 2)
    assert.deepEqual(logs, ['Open Library /search.json: no answer in 20 ms'])
  })

  it('treats an answer that is not JSON as a failure', async () => {
    const { lookup } = setup({ answer: (url) => (isSearch(url) ? new Response('<html>maintenance</html>', { status: 200 }) : undefined) })
    assert.equal((await lookup(WUTHERING)).status, 502)
  })
})

describe('lookup with Google Books', () => {
  const KEY = 'test-key-1'

  it('is not called without a key', async () => {
    const { lookup, calls } = setup()
    const { body } = await lookup(WUTHERING)
    assert.equal(body.sources.google, 'disabled')
    assert.ok(!calls.some(({ url }) => isGoogle(url)))
  })

  it('takes the exact-ISBN volume over a same-title one, with the key in the query', async () => {
    const { lookup, calls } = setup({ googleKey: KEY })
    const { status, body } = await lookup(WUTHERING)
    assert.equal(status, 200)
    const google = new URL(calls.find(({ url }) => isGoogle(url)).url)
    assert.equal(google.origin + google.pathname, 'https://www.googleapis.com/books/v1/volumes')
    assert.equal(google.searchParams.get('q'), `isbn:${WUTHERING}`)
    assert.equal(google.searchParams.get('key'), KEY)
    assert.equal(body.sources.google, 'ok')
    assert.equal(body.publisher, 'Bantam Classics')
    assert.equal(body.published, '1983-07-01')
    assert.equal(body.synopsis, "Emily Brontë's only novel, a tale of love & revenge on the Yorkshire moors.\n\nA Bantam Classic.")
    assert.equal(body.cover_url, 'https://covers.openlibrary.org/b/id/14839277-L.jpg')
    assert.equal(body.format, 'paperback')
    assert.deepEqual(body.sources.fields, {
      title: 'google', authors: 'google', publisher: 'google', published: 'google', synopsis: 'google', format: 'open_library', cover_url: 'open_library',
    })
  })

  it('counts a volume without the ISBN as not found', async () => {
    const { body } = await setup({ googleKey: KEY }).lookup(ROSALIND)
    assert.equal(body.sources.google, 'not_found')
    assert.equal(body.publisher, 'Independently published')
  })

  it('reports the measured 429 as failed, keeps the Open Library answer and keeps the key out of the log', async () => {
    const quota = readFixture('google/error-429.json')
    const { lookup, logs } = setup({ googleKey: KEY, answer: (url) => (isGoogle(url) ? json(quota, 429) : undefined) })
    const { status, body } = await lookup(WUTHERING)
    assert.equal(status, 200)
    assert.equal(body.sources.google, 'failed')
    assert.equal(body.sources.open_library, 'ok')
    assert.deepEqual(logs, ['Google Books /books/v1/volumes: HTTP 429'])
    assert.ok(!logs.join('').includes(KEY))
  })

  it('takes the synopsis from Google when the Open Library work request fails', async () => {
    const search = readFixture(`openlibrary/search-${WUTHERING}.json`)
    search.docs[0].editions.docs[0].isbn = ['9780141439556']
    const { lookup } = setup({ googleKey: KEY, answer: (url) => (isSearch(url) ? json(search) : url.includes('/works/') ? json({}, 500) : undefined) })
    const { body } = await lookup(WUTHERING)
    assert.equal(body.sources.fields.synopsis, 'google')
    assert.match(body.synopsis, /^Emily Brontë's only novel/)
  })

  it('answers 502 when Google fails and Open Library knows nothing', async () => {
    const { lookup } = setup({
      googleKey: KEY,
      answer: (url) => (isGoogle(url) ? json({}, 403) : isSearch(url) ? json({ numFound: 0, docs: [] }) : undefined),
    })
    assert.equal((await lookup(WUTHERING)).status, 502)
  })
})

describe('Google Books by volume id (Dynamic Links)', () => {
  const KEY = 'test-key-2'
  const UNINDEXED = '9781969253096'
  const UNKNOWN = '9799999999990'
  const LINKS = 'https://books.google.com/books?'
  const isLinks = (url) => url.startsWith(LINKS)
  const isVolume = (url) => url.startsWith('https://www.googleapis.com/books/v1/volumes/')
  const script = (body) => new Response(body, { headers: { 'content-type': 'application/javascript; charset=ISO-8859-1' } })
  const googleCalls = (calls) => calls.filter(({ url }) => isGoogle(url)).map(({ url }) => new URL(url).pathname)

  it('asks Dynamic Links after a search miss and takes the volume it names', async () => {
    const { lookup, calls, logs } = setup({ googleKey: KEY })
    const { status, body } = await lookup(UNINDEXED)
    assert.equal(status, 200)
    assert.equal(body.sources.google, 'ok')
    assert.equal(body.title, 'The Unindexed Edition')
    assert.deepEqual(body.authors, ['Ada Placeholder'])
    assert.equal(body.synopsis, 'A volume the search index does not return.')
    assert.equal(body.cover_url, 'https://books.google.com/books/content?id=cXnt0QEACAAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api&fife=w1600')
    assert.deepEqual(googleCalls(calls), ['/books/v1/volumes', '/books', '/books/v1/volumes/cXnt0QEACAAJ'])
    const links = calls.find(({ url }) => isLinks(url))
    assert.equal(links.url, `${LINKS}bibkeys=ISBN:${UNINDEXED}&jscmd=viewapi`)
    assert.match(links.init.headers['User-Agent'], /^Hemlock\//)
    assert.equal(calls.find(({ url }) => isVolume(url)).url, `https://www.googleapis.com/books/v1/volumes/cXnt0QEACAAJ?key=${KEY}`)
    assert.deepEqual(logs, [])
  })

  it('never asks Dynamic Links when the search has the exact volume', async () => {
    const { lookup, calls } = setup({ googleKey: KEY })
    await lookup(WUTHERING)
    assert.deepEqual(googleCalls(calls), ['/books/v1/volumes'])
  })

  it('answers not found when Dynamic Links knows nothing', async () => {
    const { lookup, calls } = setup({ googleKey: KEY })
    const { status, body } = await lookup(UNKNOWN)
    assert.equal(status, 404)
    assert.equal(body.sources.google, 'not_found')
    assert.deepEqual(googleCalls(calls), ['/books/v1/volumes', '/books'])
  })

  it('refuses a volume that does not carry the ISBN', async () => {
    const volume = readFixture('google/volume-cXnt0QEACAAJ.json')
    volume.volumeInfo.industryIdentifiers = [{ type: 'ISBN_13', identifier: '9780000000019' }]
    const { lookup } = setup({ googleKey: KEY, answer: (url) => (isVolume(url) ? json(volume) : undefined) })
    const { body } = await lookup(UNINDEXED)
    assert.equal(body.sources.google, 'not_found')
  })

  it('treats a malformed Dynamic Links answer as not found, in one log line', async () => {
    for (const bad of ['<html>sorry</html>', 'var _GBSBookInfo = {"ISBN:', 'var _GBSBookInfo = [1];']) {
      const { lookup, calls, logs } = setup({ googleKey: KEY, answer: (url) => (isLinks(url) ? script(bad) : undefined) })
      const { body } = await lookup(UNINDEXED)
      assert.equal(body.sources.google, 'not_found', bad)
      assert.deepEqual(logs, ['Google Books Dynamic Links /books: the answer is not the _GBSBookInfo script'], bad)
      assert.ok(!calls.some(({ url }) => isVolume(url)), bad)
    }
  })

  it('never requests an id that is not a volume id', async () => {
    for (const id of ['../../users', 'cXnt0QEACAAJ?key=x', 'a b', '']) {
      const info = `https://books.google.com/books?id=${encodeURIComponent(id)}&source=gbs_ViewAPI`
      const body = `var _GBSBookInfo = ${JSON.stringify({ [`ISBN:${UNINDEXED}`]: { bib_key: `ISBN:${UNINDEXED}`, info_url: info } })};`
      const { lookup, calls } = setup({ googleKey: KEY, answer: (url) => (isLinks(url) ? script(body) : undefined) })
      assert.equal((await lookup(UNINDEXED)).body.sources.google, 'not_found', id)
      assert.ok(!calls.some(({ url }) => isVolume(url)), id)
    }
  })

  it("keeps the search's answer when Dynamic Links fails, and fails when the named volume does", async () => {
    const down = setup({ googleKey: KEY, answer: (url) => (isLinks(url) ? json({ error: 'busy' }, 503) : undefined) })
    assert.equal((await down.lookup(UNINDEXED)).body.sources.google, 'not_found')
    const volumeDown = setup({ googleKey: KEY, answer: (url) => (isVolume(url) ? json({ error: 'busy' }, 503) : undefined) })
    assert.equal((await volumeDown.lookup(UNINDEXED)).body.sources.google, 'failed')
    assert.ok(!volumeDown.logs.join('').includes(KEY))
  })

  it('does not ask Dynamic Links after a failed search', async () => {
    const { lookup, calls } = setup({ googleKey: KEY, answer: (url) => (url.includes('/volumes?q=') ? json({ error: 'quota' }, 429) : undefined) })
    assert.equal((await lookup(UNINDEXED)).body.sources.google, 'failed')
    assert.ok(!calls.some(({ url }) => isLinks(url)))
  })
})

describe('cover probes', () => {
  const BN = (isbn) => `https://cdn.shopify.com/s/files/1/0674/5433/7265/files/${isbn}_p0.jpg`
  const AMAZON = 'https://images-na.ssl-images-amazon.com/images/P/0553212583.01.LZZZZZZZ.jpg'
  const head = (status, type, length) => new Response(null, { status, headers: { ...(type && { 'content-type': type }), ...(length !== undefined && { 'content-length': String(length) }) } })
  const answers = (bn, amazon) => (url) => (url.startsWith('https://cdn.shopify.com/') ? bn() : amazon())

  it("sends one HEAD request each to Barnes & Noble and Amazon and takes Barnes & Noble's cover first", async () => {
    const { lookup, probes } = setup({ probe: answers(() => head(200, 'image/jpeg', 110898), () => head(200, 'image/jpeg', 18480)) })
    const { status, body } = await lookup(WUTHERING)
    assert.equal(status, 200)
    assert.equal(body.cover_url, BN(WUTHERING))
    assert.equal(body.sources.fields.cover_url, 'barnes_noble')
    assert.deepEqual(probes.map(({ url }) => url).sort(), [BN(WUTHERING), AMAZON].sort())
    for (const { init } of probes) {
      assert.equal(init.redirect, 'manual')
      assert.ok(init.signal instanceof AbortSignal)
      assert.match(init.headers['User-Agent'], /^Hemlock\//)
    }
  })

  it('counts only a 200 image as a hit, and an Amazon image only above 1000 bytes', async () => {
    const cases = [
      [() => head(404), () => head(200, 'image/jpeg', 18480), AMAZON, 'amazon'],
      [() => head(502), () => head(200, 'image/gif', 43), null, null],
      [() => head(200, 'text/html', 5000), () => head(200, 'image/jpeg', 1000), null, null],
      [() => head(301, 'image/jpeg'), () => head(200, 'image/jpeg', 1001), AMAZON, 'amazon'],
    ]
    for (const [bn, amazon, url, source] of cases) {
      // Open Library's own covers are dropped so that the probes decide.
      const { lookup } = setup({
        probe: answers(bn, amazon),
        answer: (url) => (isSearch(url) ? json({ numFound: 1, docs: [{ key: '/works/OL1W', title: 'T', author_name: ['A'], editions: { numFound: 0, docs: [] } }] }) : undefined),
      })
      const { body } = await lookup(WUTHERING)
      assert.deepEqual([body.cover_url, body.sources.fields.cover_url ?? null], [url, source], String(source))
    }
  })

  it('never fails the lookup for a probe that errs or does not answer in time, and asks again next time', async () => {
    let hang = true
    const { lookup, probes } = setup({
      timeoutMs: 20,
      probe: (url, init) => (hang && url.startsWith('https://cdn.shopify.com/')
        ? new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))
        : Promise.reject(new TypeError('fetch failed'))),
    })
    const first = await lookup(WUTHERING)
    assert.equal(first.status, 200)
    assert.equal(first.body.cover_url, 'https://covers.openlibrary.org/b/id/14839277-L.jpg')
    hang = false
    await lookup(WUTHERING)
    assert.equal(probes.length, 4)
  })

  it('keeps a complete probe answer as long as a source answer, and asks only Barnes & Noble for a 979 ISBN', async () => {
    const { lookup, probes } = setup()
    await lookup(WUTHERING)
    await lookup(WUTHERING)
    assert.equal(probes.length, 2)
    await lookup(ROSALIND)
    assert.deepEqual(probes.slice(2).map(({ url }) => url), [BN(ROSALIND)])
  })
})

describe('lookup cache', () => {
  it('keeps an answer for 24 hours', async () => {
    const { lookup, calls, clock } = setup()
    await lookup(WUTHERING)
    const sent = calls.length
    clock.advance(CACHE_MS - 1)
    assert.equal((await lookup(WUTHERING)).body.title, 'Wuthering Heights')
    assert.equal(calls.length, sent)
    clock.advance(1)
    await lookup(WUTHERING)
    assert.equal(calls.length, sent * 2)
  })

  it('does not keep a failure or a miss', async () => {
    let mode = 'fail'
    const { lookup } = setup({
      answer: (url) => {
        if (!isSearch(url)) return undefined
        if (mode === 'fail') return json({}, 500)
        if (mode === 'miss') return json({ numFound: 0, docs: [] })
      },
    })
    assert.equal((await lookup(WUTHERING)).status, 502)
    mode = 'miss'
    assert.equal((await lookup(WUTHERING)).status, 404)
    mode = 'found'
    assert.equal((await lookup(WUTHERING)).status, 200)
  })

  it('does not keep an answer whose work request failed', async () => {
    let failWork = true
    const { lookup, calls } = setup({ answer: (url) => (failWork && url.includes('/works/') ? json({}, 500) : undefined) })
    assert.equal((await lookup(ROSALIND)).body.synopsis, null)
    failWork = false
    const { body } = await lookup(ROSALIND)
    assert.equal(calls.filter(({ url }) => isSearch(url)).length, 2)
    assert.match(body.synopsis, /^\*\*I wove a deadly web/)
    assert.equal(body.sources.fields.synopsis, 'open_library_work')
  })

  it('shares the requests of concurrent lookups of one ISBN', async () => {
    const { lookup, calls } = setup()
    const [a, b] = await Promise.all([lookup(WUTHERING), lookup(WUTHERING)])
    assert.deepEqual(a, b)
    assert.equal(calls.length, 2)
  })
})

describe('Open Library rate limit', () => {
  const flush = async () => {
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve))
  }
  before(() => mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 }))
  after(() => mock.timers.reset())

  // Each start time is read at a tick's end, so the step divides every interval.
  async function startTimes({ contact, googleKey = null }) {
    const step = contact ? 2 : 100
    const { fetch, calls } = fixtureFetch({ now: () => Date.now() })
    const lookup = createLookup({ fetch, contact, googleKey, now: () => Date.now(), log: () => {} })
    const isbns = ['9780553212587', '9798322853480', '9780345803481', '9781853260629']
    let settled = false
    const done = Promise.all(isbns.map((isbn) => lookup(isbn))).finally(() => (settled = true))
    for (let elapsed = 0; elapsed < 20_000 && !settled; elapsed += step) {
      await flush()
      mock.timers.tick(step)
    }
    await done
    assert.equal(calls.filter(({ url }) => !isGoogle(url)).length, 9)
    return calls
  }

  it('starts queued requests 1000 ms apart without a contact', async () => {
    const calls = await startTimes({ contact: null })
    const starts = calls.filter(({ url }) => isSearch(url)).map(({ at }) => at)
    const all = calls.filter(({ url }) => !isGoogle(url)).map(({ at }) => at)
    assert.deepEqual(starts.slice(0, 4).map((at) => at - starts[0]), [0, 1000, 2000, 3000])
    for (let i = 1; i < all.length; i++) assert.ok(all[i] - all[i - 1] >= 1000, `requests ${i - 1} and ${i} are ${all[i] - all[i - 1]} ms apart`)
  })

  it('starts queued requests 334 ms apart with a contact, which the User-Agent names', async () => {
    const calls = await startTimes({ contact: 'owner@example.org' })
    const all = calls.filter(({ url }) => !isGoogle(url))
    for (let i = 1; i < all.length; i++) assert.ok(all[i].at - all[i - 1].at >= 334, `requests ${i - 1} and ${i} are ${all[i].at - all[i - 1].at} ms apart`)
    assert.deepEqual(all.slice(0, 3).map(({ at }) => at - all[0].at), [0, 334, 668])
    assert.equal(all[0].init.headers['User-Agent'], `Hemlock/${version} (github.com/strachanbrad/hemlock; owner@example.org)`)
  })

  it('does not hold Google requests behind the Open Library queue', async () => {
    const calls = await startTimes({ contact: null, googleKey: 'k' })
    const google = calls.filter(({ url }) => isGoogle(url)).map(({ at }) => at)
    assert.equal(calls.filter(({ url }) => url.includes('/volumes?q=isbn:')).length, 4)
    assert.deepEqual([...new Set(google)], [calls[0].at])
  })

  it('lets the next task start in its slot after a task fails', async () => {
    const schedule = createLimiter({ interval: 1000, now: () => Date.now(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) })
    const start = Date.now()
    const failing = schedule(async () => {
      throw new Error('boom')
    })
    const next = schedule(async () => Date.now() - start)
    await assert.rejects(failing, /boom/)
    await flush()
    mock.timers.tick(999)
    await flush()
    let settled = false
    next.then(() => (settled = true))
    await flush()
    assert.equal(settled, false)
    mock.timers.tick(1)
    assert.equal(await next, 1000)
  })
})

describe('GET /api/lookup/:isbn', () => {
  let server
  let base
  let db
  let cookie
  let requested
  const results = new Map()

  before(async () => {
    const { createApp, openDb } = await loadApp()
    db = openDb(dataDir)
    const lookup = async (isbn) => {
      requested.push(isbn)
      return results.get(isbn) ?? { status: 404, body: { error: 'none' } }
    }
    server = await new Promise((resolve) => {
      const listening = createApp({ db, lookup }).listen(0, '127.0.0.1', () => resolve(listening))
    })
    base = `http://127.0.0.1:${server.address().port}`
    cookie = await signIn(db)
  })
  after(async () => {
    await new Promise((resolve) => server.close(resolve))
    db.close()
    fs.rmSync(dataDir, { recursive: true, force: true })
  })

  const get = async (isbn) => {
    requested = []
    const response = await fetch(`${base}/api/lookup/${encodeURIComponent(isbn)}`, { headers: { Cookie: cookie } })
    return { status: response.status, body: await response.json() }
  }

  it('refuses anything that is not an ISBN with 400 before asking a source', async () => {
    for (const isbn of ['123', '9781471132191', '9771234567003', 'abc', '0X56029438']) {
      assert.deepEqual(await get(isbn), { status: 400, body: { error: 'Not a valid ISBN-10 or ISBN-13' } }, isbn)
      assert.deepEqual(requested, [])
    }
  })

  it('asks for the ISBN-13 of an ISBN-10 or a hyphenated ISBN', async () => {
    results.set(WUTHERING, { status: 200, body: { isbn: WUTHERING } })
    for (const isbn of ['0553212583', '978-0-553-21258-7', 'ISBN 978 0553 212587']) {
      assert.deepEqual(await get(isbn), { status: 200, body: { isbn: WUTHERING } }, isbn)
      assert.deepEqual(requested, [WUTHERING])
    }
  })

  it('passes 404 and 502 through as { error }', async () => {
    results.set(ROSALIND, { status: 502, body: { error: 'No book source answered; try again later' } })
    assert.deepEqual(await get(ROSALIND), { status: 502, body: { error: 'No book source answered; try again later' } })
    assert.deepEqual(await get(FIFTY), { status: 404, body: { error: 'none' } })
  })

  it('answers through the real lookup from the fixtures', async () => {
    const clock = instantClock()
    const { fetch } = fixtureFetch({ now: clock.now })
    const { createApp } = await loadApp()
    const app = createApp({ db, lookup: createLookup({ fetch, now: clock.now, sleep: clock.sleep }) })
    const real = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
    })
    try {
      const answer = await globalThis.fetch(`http://127.0.0.1:${real.address().port}/api/lookup/0553212583`, { headers: { Cookie: cookie } })
      assert.equal(answer.status, 200)
      const body = await answer.json()
      assert.equal(body.isbn, WUTHERING)
      assert.equal(body.title, 'Wuthering Heights')
      assert.equal(body.sources.open_library, 'ok')
    } finally {
      await new Promise((resolve) => real.close(resolve))
    }
  })
})

describe('lookup configuration', () => {
  it('reads the Google key and the contact, both optional', () => {
    const plain = loadConfig({})
    assert.equal(plain.googleBooksApiKey, null)
    assert.equal(plain.lookupContact, null)
    assert.equal(plain.userAgent, `Hemlock/${version} (github.com/strachanbrad/hemlock)`)
    const set = loadConfig({ GOOGLE_BOOKS_API_KEY: ' abc ', LOOKUP_CONTACT: ' owner@example.org ' })
    assert.equal(set.googleBooksApiKey, 'abc')
    assert.equal(set.lookupContact, 'owner@example.org')
    assert.equal(set.userAgent, `Hemlock/${version} (github.com/strachanbrad/hemlock; owner@example.org)`)
    assert.equal(loadConfig({ GOOGLE_BOOKS_API_KEY: '', LOOKUP_CONTACT: '' }).googleBooksApiKey, null)
  })

  it('refuses a contact that would break the User-Agent header', () => {
    for (const LOOKUP_CONTACT of ['owner', 'a b@example.org', 'owner@example.org)', 'x@y; evil', 'a@b\r\nX: 1']) {
      assert.throws(() => loadConfig({ LOOKUP_CONTACT }), /LOOKUP_CONTACT is not an email address/, LOOKUP_CONTACT)
    }
  })
})
