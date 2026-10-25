/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { MAX_REQUESTS, NUDGE, createAnthropic, question, verdict } from '../src/lookup/anthropic.js'

const ISBN = '9781969253096'
const KEY = 'sk-ant-test-SECRET-0123456789abcdef'
const dir = path.join(import.meta.dirname, 'fixtures/anthropic')
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'))
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } })

// Answers each request with the next response in `script` (a fixture name, or a Response) and keeps
// every request body for the test to read.
function replay(...script) {
  const requests = []
  const logs = []
  const fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) })
    const next = script.shift()
    if (next === undefined) throw new Error('the test script has no more answers')
    return typeof next === 'string' ? json(fixture(next)) : next
  }
  const claude = createAnthropic({ apiKey: KEY, model: 'claude-opus-5-5', fetch, log: (line) => logs.push(line) })
  return { claude, requests, logs }
}

const reportWith = (input) => {
  const answer = fixture('report-book')
  const call = answer.content.find((block) => block.type === 'tool_use')
  Object.assign(call.input, input)
  return json(answer)
}

describe('createAnthropic identify', () => {
  it('resumes a paused turn with the assistant turn alone and takes the report_book call', async () => {
    const { claude, requests } = replay('pause-turn', 'report-book')
    const result = await claude.identify(ISBN)
    assert.deepEqual(result, {
      status: 'ok',
      record: {
        isbn: ISBN,
        title: 'The Poison Garden',
        authors: ['Iris Vane', 'Marlowe Ash'],
        publisher: 'Nightshade Press',
        published: '2025-09-16',
        synopsis: 'In a walled garden where every flower can kill, a botanist keeps a ledger of the dead.\n\nNow the ledger has a new name in it.',
        format: 'paperback',
        cover_url: 'https://m.media-amazon.com/images/I/71PoisonGarden.jpg',
        source_url: 'https://www.amazon.com/dp/1969253096',
      },
    })
    assert.equal(requests.length, 2)
    const [first, second] = requests.map(({ body }) => body)
    assert.deepEqual(first.messages, [{ role: 'user', content: question(ISBN) }])
    assert.equal(second.messages.length, 2)
    assert.deepEqual(second.messages[0], first.messages[0])
    assert.deepEqual(second.messages[1], { role: 'assistant', content: fixture('pause-turn').content })
  })

  it('sends one request shape: web search, a strict report_book, auto tool choice, medium effort, nothing the model rejects', async () => {
    const { claude, requests } = replay('report-book')
    await claude.identify(ISBN)
    const [{ url, body }] = requests
    assert.equal(url, 'https://api.anthropic.com/v1/messages')
    assert.equal(body.model, 'claude-opus-5-5')
    assert.equal(body.max_tokens, 8000)
    assert.deepEqual(body.tool_choice, { type: 'auto' })
    assert.deepEqual(body.output_config, { effort: 'medium' })
    assert.deepEqual(body.tools[0], { type: 'web_search_20260209', name: 'web_search', max_uses: 5 })
    const report = body.tools[1]
    assert.equal(report.name, 'report_book')
    assert.equal(report.strict, true)
    assert.equal(report.input_schema.additionalProperties, false)
    assert.deepEqual(report.input_schema.required, Object.keys(report.input_schema.properties))
    assert.deepEqual(report.input_schema.properties.found, { type: 'boolean', description: report.input_schema.properties.found.description })
    for (const absent of ['temperature', 'top_p', 'top_k', 'thinking']) assert.equal(body[absent], undefined, absent)
    assert.match(body.system, /quoted string/)
    assert.match(body.system, /never your own summary/i)
    assert.match(body.messages[0].content, /ISBN-13 9781969253096 \(ISBN-10 1969253096\)/)
  })

  it('asks a 979 ISBN by its ISBN-13 alone', () => {
    assert.equal(question('9798322853480'), 'Identify the book with ISBN-13 9798322853480 and report it with report_book.')
  })

  it('nudges once after a turn that ends without the call, then fails', async () => {
    const { claude, requests, logs } = replay('end-turn', 'end-turn')
    const result = await claude.identify(ISBN)
    assert.deepEqual(result, { status: 'failed', message: 'Claude stopped (end_turn) without reporting a book' })
    assert.equal(requests.length, 2)
    const messages = requests[1].body.messages
    assert.deepEqual(messages.slice(1), [{ role: 'assistant', content: fixture('end-turn').content }, { role: 'user', content: NUDGE }])
    assert.deepEqual(logs, [`Claude lookup of ${ISBN} failed: Claude stopped (end_turn) without reporting a book`])
  })

  it('takes the call that follows the nudge', async () => {
    const { claude, requests } = replay('end-turn', 'report-book')
    assert.equal((await claude.identify(ISBN)).status, 'ok')
    assert.equal(requests.length, 2)
  })

  it('reports found false as not found', async () => {
    const { claude } = replay('not-found')
    assert.deepEqual(await claude.identify(ISBN), { status: 'not_found' })
  })

  it('refuses a listing that shows another ISBN', async () => {
    const { claude, logs } = replay(reportWith({ isbn_on_listing: '9781969253102' }))
    assert.deepEqual(await claude.identify(ISBN), { status: 'not_found' })
    assert.deepEqual(logs, [`Claude lookup of ${ISBN}: the listing shows ISBN "9781969253102"; not accepted`])
  })

  it('accepts a listing that shows the ISBN-10', async () => {
    const { claude } = replay(reportWith({ isbn_on_listing: 'ISBN-10: 1-969253-09-6' }))
    assert.equal((await claude.identify(ISBN)).status, 'ok')
  })

  it('drops a cover off the allow-list and keeps the rest', async () => {
    const { claude } = replay(reportWith({ cover_url: 'https://www.amazon.com/images/cover.jpg' }))
    const { status, record } = await claude.identify(ISBN)
    assert.equal(status, 'ok')
    assert.equal(record.cover_url, null)
    assert.equal(record.title, 'The Poison Garden')
  })

  it('fails on a refusal and on a turn cut off by max_tokens, without reading its partial input', async () => {
    const refused = replay('refusal')
    assert.deepEqual(await refused.claude.identify(ISBN), { status: 'failed', message: 'Claude declined to look the book up' })
    const cut = replay('max-tokens')
    assert.deepEqual(await cut.claude.identify(ISBN), { status: 'failed', message: 'Claude ran out of room before it answered' })
  })

  it(`stops after ${MAX_REQUESTS} requests`, async () => {
    const { claude, requests } = replay('pause-turn', 'pause-turn', 'pause-turn', 'pause-turn', 'report-book')
    assert.deepEqual(await claude.identify(ISBN), { status: 'failed', message: `Claude did not answer within ${MAX_REQUESTS} requests` })
    assert.equal(requests.length, MAX_REQUESTS)
  })

  it('turns an API error into a failure with the provider message, never the key', async () => {
    const error = fixture('error-401')
    error.error.message = `invalid x-api-key ${KEY}`
    const { claude, logs } = replay(json(error, 401))
    const result = await claude.identify(ISBN)
    assert.deepEqual(result, { status: 'failed', message: 'Anthropic answered HTTP 401: invalid x-api-key [redacted]' })
    assert.ok(!JSON.stringify({ result, logs }).includes(KEY))
    assert.equal(logs.length, 1)
  })

  it('fails without retrying when the network fails', async () => {
    let calls = 0
    const claude = createAnthropic({
      apiKey: KEY,
      fetch: async () => {
        calls++
        throw new TypeError('fetch failed')
      },
      log: () => {},
    })
    const result = await claude.identify(ISBN)
    assert.equal(result.status, 'failed')
    assert.match(result.message, /^Anthropic did not answer: /)
    assert.equal(calls, 1)
  })

  it('keeps the key out of every result and log line across the scenarios', async () => {
    const seen = []
    for (const script of [['pause-turn', 'report-book'], ['end-turn', 'end-turn'], ['not-found'], ['refusal'], ['max-tokens']]) {
      const { claude, logs } = replay(...script)
      seen.push(await claude.identify(ISBN), logs)
    }
    assert.ok(!JSON.stringify(seen).includes(KEY))
  })
})

describe('verdict', () => {
  const base = fixture('report-book').content.find((block) => block.type === 'tool_use').input
  const check = (input) => verdict(ISBN, { ...base, ...input })

  it('bounds and normalises every field whatever the model sent', () => {
    const { record } = check({
      title: 'T'.repeat(600),
      publisher: 'P'.repeat(300),
      synopsis: 'S'.repeat(5000),
      authors: Array.from({ length: 12 }, (_, i) => `${'A'.repeat(250)}${i}`),
    })
    assert.equal(record.title.length, 500)
    assert.equal(record.publisher.length, 200)
    assert.equal(record.synopsis.length, 4000)
    assert.equal(record.authors.length, 10)
    assert.ok(record.authors.every((name) => name.length === 200))
  })

  it('nulls a date, format, source or cover it cannot use', () => {
    for (const published of ['September 2025', '2025-13', '2025-02-30', '25', 2025]) assert.equal(check({ published }).record.published, null, String(published))
    for (const published of ['2025', '2025-09', '2024-02-29']) assert.equal(check({ published }).record.published, published)
    for (const format of ['audiobook', 'Paperback', 'board book', null]) assert.equal(check({ format }).record.format, null, String(format))
    for (const source_url of ['http://www.amazon.com/dp/1', 'javascript:alert(1)', 'https://user:pw@example.com/x', 'not a url', 7]) {
      assert.equal(check({ source_url }).record.source_url, null, String(source_url))
    }
    for (const cover_url of ['http://m.media-amazon.com/images/I/1.jpg', 'https://example.com/cover.jpg', 'data:image/png;base64,AAAA']) {
      assert.equal(check({ cover_url }).record.cover_url, null, cover_url)
    }
    assert.equal(check({ cover_url: 'https://i.gr-assets.com/images/S/1.jpg' }).record.cover_url, 'https://i.gr-assets.com/images/S/1.jpg')
  })

  it('counts a missing or wrong found flag and a missing ISBN as not found', () => {
    for (const input of [{ found: false }, { found: 'true' }, { isbn_on_listing: null }, { isbn_on_listing: '' }, { isbn_on_listing: '9781969253096 and 9781969253102' }]) {
      assert.deepEqual(check(input), { status: 'not_found' }, JSON.stringify(input))
    }
    assert.deepEqual(verdict(ISBN, null), { status: 'not_found' })
  })

  it('gives empty authors for null and keeps nulls for the rest', () => {
    const { record } = check({ title: null, authors: null, publisher: '   ', synopsis: null })
    assert.equal(record.title, null)
    assert.deepEqual(record.authors, [])
    assert.equal(record.publisher, null)
    assert.equal(record.synopsis, null)
  })
})

describe('createAnthropic probe', () => {
  it('sends the one-word prompt on the saved model at low effort and reports the reply', async () => {
    const requests = []
    const claude = createAnthropic({
      apiKey: KEY,
      model: 'claude-haiku-5-5',
      fetch: async (url, init) => {
        requests.push(JSON.parse(init.body))
        return json({ ...fixture('probe-ok'), model: 'claude-haiku-5-5' })
      },
    })
    assert.deepEqual(await claude.probe(), { ok: true, detail: 'claude-haiku-5-5 replied “ok”' })
    assert.deepEqual(requests, [{ model: 'claude-haiku-5-5', max_tokens: 64, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Reply with the single word ok.' }] }])
  })

  it('answers the provider message without the key', async () => {
    const error = fixture('error-401')
    error.error.message = `bad key ${KEY}`
    const claude = createAnthropic({ apiKey: KEY, fetch: async () => json(error, 401) })
    assert.deepEqual(await claude.probe(), { ok: false, error: 'Anthropic answered HTTP 401: bad key [redacted]' })
  })
})
