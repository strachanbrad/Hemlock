/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { startServer } from './support/server.js'
import { fixtureFetch, instantClock, json } from './support/fixtures.js'

const { CACHE_MS, createIdentify, createLookup } = await import('../src/lookup/index.js')
const { createAnthropic } = await import('../src/lookup/anthropic.js')

const ISBN = '9781969253096'
const WUTHERING = '9780553212587'
const KEY = 'sk-ant-test-IDENTIFY-SECRET-0123456789'
const RECORD = {
  isbn: ISBN, title: 'The Poison Garden', authors: ['Iris Vane'], publisher: 'Nightshade Press', published: '2025-09-16',
  synopsis: null, format: 'paperback', cover_url: 'https://m.media-amazon.com/images/I/71PoisonGarden.jpg', source_url: 'https://www.amazon.com/dp/1969253096',
}
const NO_COVERS = { status: 'ok', barnes_noble: null, amazon: null }
const anthropicFixture = (name) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/anthropic', `${name}.json`), 'utf8'))

describe('GET /api/lookup/:isbn offers Claude', () => {
  const lookupWith = (options) => createLookup({ ...fixtureFetch(), ...instantClock(), log: () => {}, ...options })

  it("is 'available' on a miss with a Claude key, 'disabled' without one, and 'disabled' once a source answers", async () => {
    let key = null
    const lookup = lookupWith({ anthropicKey: () => key })
    assert.equal((await lookup(ISBN)).body.sources.anthropic, 'disabled')
    key = KEY
    const miss = await lookup(ISBN)
    assert.equal(miss.status, 404)
    assert.deepEqual(miss.body.sources, { google: 'disabled', open_library: 'not_found', anthropic: 'available' })
    const hit = await lookup(WUTHERING)
    assert.equal(hit.status, 200)
    assert.equal(hit.body.sources.anthropic, 'disabled')
  })

  it('reads the Google key and the contact at each lookup', async () => {
    let googleKey = null
    let contact = null
    const { fetch, calls } = fixtureFetch()
    const clock = instantClock()
    const lookup = createLookup({ fetch, googleKey: () => googleKey, contact: () => contact, now: clock.now, sleep: clock.sleep, log: () => {} })
    await lookup(ISBN)
    assert.ok(calls.every(({ url }) => !url.includes('googleapis')))
    assert.doesNotMatch(calls[0].init.headers['User-Agent'], /@/)
    googleKey = 'live-key'
    contact = 'owner@example.org'
    calls.length = 0
    await lookup(ISBN)
    assert.ok(calls.some(({ url }) => url.includes('googleapis') && url.endsWith('&key=live-key')))
    assert.ok(calls.every(({ init }) => init.headers['User-Agent'].endsWith('; owner@example.org)')))
  })
})

describe('createIdentify', () => {
  function setup({ key = KEY, model = null, answer = async () => ({ status: 'ok', record: RECORD }), covers = async () => NO_COVERS } = {}) {
    const clock = instantClock(1_000_000)
    const made = []
    const logs = []
    const probed = []
    const state = { key, model }
    const anthropic = (options) => {
      made.push(options)
      return { identify: (isbn) => answer(isbn) }
    }
    const probeCovers = (isbn) => {
      probed.push(isbn)
      return covers(isbn)
    }
    const identify = createIdentify({ apiKey: () => state.key, model: () => state.model, now: clock.now, anthropic, probeCovers, log: (line) => logs.push(line) })
    return { identify, made, probed, logs, clock, state }
  }

  it('answers 503 without a key and asks nothing', async () => {
    const { identify, made } = setup({ key: null })
    assert.deepEqual(await identify(ISBN), { status: 503, body: { error: 'Claude is not configured' } })
    assert.deepEqual(made, [])
  })

  it('answers the record with every field it has credited to Claude, and the listing', async () => {
    const { identify, made } = setup()
    assert.deepEqual(await identify(ISBN), {
      status: 200,
      body: {
        ...RECORD,
        sources: { anthropic: 'ok', fields: { title: 'anthropic', authors: 'anthropic', publisher: 'anthropic', published: 'anthropic', format: 'anthropic', cover_url: 'anthropic' } },
      },
    })
    assert.equal(made[0].apiKey, KEY)
    assert.equal(made[0].model, 'claude-opus-5-5')
  })

  it('uses the saved model and the saved key at each call', async () => {
    const { identify, made, state } = setup({ answer: async () => ({ status: 'not_found' }) })
    state.model = 'claude-haiku-5-5'
    state.key = 'sk-ant-other'
    await identify(ISBN)
    assert.deepEqual([made[0].apiKey, made[0].model], ['sk-ant-other', 'claude-haiku-5-5'])
  })

  it('answers 404 when Claude found nothing and 502 when the call failed', async () => {
    const missing = setup({ answer: async () => ({ status: 'not_found' }) })
    assert.deepEqual(await missing.identify(ISBN), { status: 404, body: { error: `Claude found no listing that shows ISBN ${ISBN}` } })
    const failing = setup({ answer: async () => ({ status: 'failed', message: 'Anthropic answered HTTP 529: Overloaded' }) })
    assert.deepEqual(await failing.identify(ISBN), { status: 502, body: { error: 'The Claude lookup failed: Anthropic answered HTTP 529: Overloaded' } })
  })

  it('answers 502 and logs without the key when the client throws', async () => {
    const { identify, logs } = setup({
      answer: async () => {
        throw new Error(`exploded near ${KEY}`)
      },
    })
    assert.deepEqual(await identify(ISBN), { status: 502, body: { error: 'The Claude lookup failed: an unexpected error' } })
    assert.deepEqual(logs, [`Claude lookup of ${ISBN} failed: exploded near [redacted]`])
  })

  // A mutant that asks twice leaves a held answer unreleased; the timeout turns that hang into a failure.
  it('shares one request between concurrent calls and keeps an ok answer for 24 hours', { timeout: 5000 }, async () => {
    let release
    const { identify, made, clock } = setup({ answer: () => new Promise((resolve) => (release = () => resolve({ status: 'ok', record: RECORD }))) })
    const both = Promise.all([identify(ISBN), identify(ISBN)])
    await new Promise((resolve) => setImmediate(resolve))
    release()
    const [first, second] = await both
    assert.deepEqual(first, second)
    assert.equal(made.length, 1)
    clock.advance(CACHE_MS - 1)
    assert.equal((await identify(ISBN)).status, 200)
    assert.equal(made.length, 1)
    clock.advance(1)
    const again = identify(ISBN)
    await new Promise((resolve) => setImmediate(resolve))
    release()
    await again
    assert.equal(made.length, 2)
  })

  it('asks again after a miss or a failure', async () => {
    const { identify, made } = setup({ answer: async () => ({ status: 'not_found' }) })
    await identify(ISBN)
    await identify(ISBN)
    assert.equal(made.length, 2)
  })
})

describe('POST /api/lookup/:isbn/identify', () => {
  let app
  let requested
  let result
  before(async () => {
    app = await startServer({
      identify: async (isbn) => {
        requested.push(isbn)
        return result
      },
    })
  })
  after(() => app.close())
  beforeEach(() => {
    requested = []
  })
  const post = async (isbn) => {
    const response = await fetch(`${app.base}/api/lookup/${encodeURIComponent(isbn)}/identify`, { method: 'POST' })
    return { status: response.status, body: await response.json() }
  }

  it('refuses a bad ISBN with 400 before asking Claude', async () => {
    assert.deepEqual(await post('9781969253097'), { status: 400, body: { error: 'Not a valid ISBN-10 or ISBN-13' } })
    assert.deepEqual(requested, [])
  })

  it('passes 200, 404, 502 and 503 through for the ISBN-13', async () => {
    for (const answer of [
      { status: 200, body: { isbn: ISBN } },
      { status: 404, body: { error: 'none' } },
      { status: 502, body: { error: 'failed' } },
      { status: 503, body: { error: 'Claude is not configured' } },
    ]) {
      result = answer
      assert.deepEqual(await post('1-969253-09-6'), answer)
    }
    assert.deepEqual(requested, [ISBN, ISBN, ISBN, ISBN])
  })
})

describe('identify through the app, from the replayed fixtures', () => {
  it('answers the validated record and never the key', async () => {
    const script = ['pause-turn', 'report-book']
    const fetch = async () => json(anthropicFixture(script.shift()))
    const logs = []
    const app = await startServer({
      identify: createIdentify({ apiKey: KEY, fetch, log: (line) => logs.push(line), anthropic: (options) => createAnthropic(options), probeCovers: async () => NO_COVERS }),
    })
    try {
      const response = await globalThis.fetch(`${app.base}/api/lookup/${ISBN}/identify`, { method: 'POST' })
      const text = await response.text()
      assert.equal(response.status, 200)
      const body = JSON.parse(text)
      assert.equal(body.title, 'The Poison Garden')
      assert.deepEqual(body.authors, ['Iris Vane', 'Marlowe Ash'])
      assert.equal(body.source_url, 'https://www.amazon.com/dp/1969253096')
      assert.equal(body.sources.anthropic, 'ok')
      assert.equal(body.sources.fields.synopsis, 'anthropic')
      assert.ok(!`${text}${JSON.stringify(logs)}`.includes(KEY))
    } finally {
      await app.close()
    }
  })

  const BN_PAGE = 'https://www.barnesandnoble.com/w/the-poison-garden-iris-vane/1146000000'
  const PAGE_COVER = 'https://prodimage.images-bn.com/pimages/9781969253096_p0_v1_s1200x630.jpg'
  const BN = 'https://cdn.shopify.com/s/files/1/0674/5433/7265/files/9781969253096_p0.jpg'

  async function identifyWith(fixture, covers) {
    const fetch = async () => json(anthropicFixture(fixture))
    const app = await startServer({ identify: createIdentify({ apiKey: KEY, fetch, log: () => {}, anthropic: (options) => createAnthropic(options), probeCovers: async () => covers }) })
    try {
      const response = await globalThis.fetch(`${app.base}/api/lookup/${ISBN}/identify`, { method: 'POST' })
      return { status: response.status, body: await response.json() }
    } finally {
      await app.close()
    }
  }

  it('copies the fields from the page Claude opened, and keeps its cover when no retailer has one', async () => {
    const { status, body } = await identifyWith('report-book-fetched', NO_COVERS)
    assert.equal(status, 200)
    assert.deepEqual([body.publisher, body.source_url, body.cover_url, body.sources.fields.cover_url], ['Nightshade Press', BN_PAGE, PAGE_COVER, 'anthropic'])
  })

  it("takes Barnes & Noble's cover over the page's", async () => {
    const { body } = await identifyWith('report-book-fetched', { status: 'ok', barnes_noble: BN, amazon: null })
    assert.deepEqual([body.cover_url, body.sources.fields.cover_url, body.title], [BN, 'barnes_noble', 'The Poison Garden'])
  })
})

describe('the cover of an identified book', () => {
  const AMAZON = 'https://images-na.ssl-images-amazon.com/images/P/1969253096.01.LZZZZZZZ.jpg'
  const BN = 'https://cdn.shopify.com/s/files/1/0674/5433/7265/files/9781969253096_p0.jpg'
  const setupWith = (options) => {
    const clock = instantClock(1_000_000)
    const probed = []
    const identify = createIdentify({
      apiKey: KEY,
      now: clock.now,
      log: () => {},
      anthropic: () => ({ identify: options.answer ?? (async () => ({ status: 'ok', record: RECORD })) }),
      probeCovers: async (isbn) => {
        probed.push(isbn)
        return options.covers()
      },
    })
    return { identify, probed }
  }
  const cover = ({ body }) => [body.cover_url, body.sources.fields.cover_url]

  it('takes Barnes & Noble, then Amazon, then the page', async () => {
    assert.deepEqual(cover(await setupWith({ covers: async () => ({ status: 'ok', barnes_noble: BN, amazon: AMAZON }) }).identify(ISBN)), [BN, 'barnes_noble'])
    assert.deepEqual(cover(await setupWith({ covers: async () => ({ status: 'ok', barnes_noble: null, amazon: AMAZON }) }).identify(ISBN)), [AMAZON, 'amazon'])
    assert.deepEqual(cover(await setupWith({ covers: async () => NO_COVERS }).identify(ISBN)), [RECORD.cover_url, 'anthropic'])
  })

  it('has no cover when the page gave none on the allow-list and no retailer has one', async () => {
    const { body } = await setupWith({ covers: async () => NO_COVERS, answer: async () => ({ status: 'ok', record: { ...RECORD, cover_url: null } }) }).identify(ISBN)
    assert.equal(body.cover_url, null)
    assert.equal(body.sources.fields.cover_url, undefined)
  })

  it('probes while Claude searches, keeps the page cover when a probe throws, and probes again for a kept answer', { timeout: 5000 }, async () => {
    let release
    let calls = 0
    const { identify, probed } = setupWith({
      answer: () => new Promise((resolve) => (release = () => resolve({ status: 'ok', record: RECORD }))),
      covers: async () => {
        calls++
        if (calls === 1) throw new Error('probe exploded')
        return { status: 'ok', barnes_noble: BN, amazon: null }
      },
    })
    const pending = identify(ISBN)
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(probed, [ISBN])
    release()
    assert.deepEqual(cover(await pending), [RECORD.cover_url, 'anthropic'])
    assert.deepEqual(cover(await identify(ISBN)), [BN, 'barnes_noble'])
    assert.equal(probed.length, 2)
  })
})
