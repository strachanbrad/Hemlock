/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, it } from 'node:test'
import { loadApp, startServer } from './support/server.js'
import { client, emptyLibrary } from './support/http.js'

const { createEvents } = await import('../src/events.js')
const { createSettings } = await import('../src/settings.js')
const { hashPassword } = await import('../src/auth.js')

const PASSWORD = 'correct horse battery'
const RETRY = 'retry: 5000\n\n'
const CHANGED = 'event: changed\ndata: {"kind":"library"}\n\n'

let app
let api
let coversDir
let events
let settings
const streams = []

before(async () => {
  events = createEvents()
  const key = crypto.randomBytes(32)
  app = await startServer((db) => {
    settings = createSettings(db, { secretKey: () => key, env: {} })
    return { events, settings }
  })
  api = client(app.base)
  coversDir = (await loadApp()).coversDir
})
after(async () => {
  for (const stream of streams) stream.close()
  try {
    await waitFor(() => events.size() === 0)
  } finally {
    await app.close()
  }
}, { timeout: 5000 })
beforeEach(() => emptyLibrary(app.db, coversDir))

async function waitFor(check, ms = 2000) {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

// Holds the stream's text as it arrives.
async function openStream(base) {
  const controller = new AbortController()
  const response = await fetch(`${base}/api/events`, { signal: controller.signal })
  const stream = { response, text: '', close: () => controller.abort() }
  streams.push(stream)
  if (response.ok) {
    ;(async () => {
      const decoder = new TextDecoder()
      try {
        for await (const chunk of response.body) stream.text += decoder.decode(chunk, { stream: true })
      } catch {
        // aborted
      }
    })()
  }
  return stream
}

const changes = (stream) => stream.text.split(CHANGED).length - 1
// Long enough for an event the server sent to have arrived over loopback.
const settle = () => new Promise((resolve) => setTimeout(resolve, 200))

async function serve(options) {
  const { createApp } = await loadApp()
  const other = createEvents(options)
  const server = await new Promise((resolve) => {
    const listening = createApp({ db: app.db, events: other }).listen(0, '127.0.0.1', () => resolve(listening))
  })
  return {
    events: other,
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => {
      server.closeAllConnections()
      server.close(resolve)
    }),
  }
}

// A stream or a hold left open fails the suite at its timeout instead of hanging the run.
describe('GET /api/events', { timeout: 15_000 }, () => {
  it('answers an unbuffered event stream that starts with the retry line', async () => {
    const stream = await openStream(app.base)
    assert.equal(stream.response.status, 200)
    assert.equal(stream.response.headers.get('content-type'), 'text/event-stream; charset=utf-8')
    assert.equal(stream.response.headers.get('cache-control'), 'no-cache, no-transform')
    assert.equal(stream.response.headers.get('x-accel-buffering'), 'no')
    await waitFor(() => stream.text === RETRY)
    stream.close()
  })

  it('sends changed, and nothing else, after a book, an edition and an author are written', async () => {
    app.db.exec("INSERT INTO authors (id, name) VALUES (7, 'Nobody Yet')")
    const stream = await openStream(app.base)
    await waitFor(() => stream.text === RETRY)

    const created = await api.post('/api/books', { title: 'Emma', author_name: 'Jane Austen', edition: { format: 'paperback' } })
    assert.equal(created.status, 201)
    await waitFor(() => changes(stream) === 1)

    assert.equal((await api.patch(`/api/editions/${created.body.editions[0].id}`, { publisher: 'Penguin' })).status, 200)
    await waitFor(() => changes(stream) === 2)

    assert.equal((await api.del('/api/authors/7')).status, 204)
    await waitFor(() => changes(stream) === 3)
    await settle()
    assert.equal(stream.text, RETRY + CHANGED.repeat(3))
    stream.close()
  })

  it('sends nothing after a refused write, a read or an admin write', async () => {
    app.db.exec("INSERT INTO authors (id, name) VALUES (1, 'Jane Austen'); INSERT INTO books (id, title, author_id) VALUES (1, 'Emma', 1)")
    const stream = await openStream(app.base)
    await waitFor(() => stream.text === RETRY)
    const { version } = (await api.get('/api/changes')).body

    assert.equal((await api.post('/api/books', { title: 'No author' })).status, 400)
    assert.equal((await api.patch('/api/books/99', { read: true })).status, 404)
    assert.equal((await api.del('/api/editions/99')).status, 404)
    assert.equal((await api.get('/api/books')).status, 200)

    settings.set('admin_password_hash', hashPassword(PASSWORD))
    const login = await fetch(`${app.base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) })
    assert.equal(login.status, 204)
    const put = await fetch(`${app.base}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: login.headers.get('set-cookie').split(';')[0] },
      body: JSON.stringify({ lookup_contact: 'owner@example.org' }),
    })
    assert.equal(put.status, 200)

    await settle()
    assert.equal(stream.text, RETRY)
    assert.deepEqual((await api.get('/api/changes')).body, { version })
    assert.equal((await api.patch('/api/books/1', { read: true })).status, 200)
    await waitFor(() => changes(stream) === 1)
    await settle()
    assert.equal(stream.text, RETRY + CHANGED)
    assert.deepEqual((await api.get('/api/changes')).body, { version: version + 1 })
    stream.close()
  })

  it('pings every pingMs, again for a client that comes after the last one left', async () => {
    const other = await serve({ pingMs: 40 })
    try {
      const first = await openStream(other.base)
      await waitFor(() => first.text.startsWith(RETRY + ': ping\n\n'))
      first.close()
      await waitFor(() => other.events.size() === 0)

      const second = await openStream(other.base)
      await waitFor(() => second.text.startsWith(RETRY + ': ping\n\n'))
      second.close()
    } finally {
      await other.close()
    }
  })

  it('pings every client from one timer', async () => {
    const other = await serve({ pingMs: 100 })
    const pings = (stream) => stream.text.split(': ping\n\n').length - 1
    try {
      const streamsOpen = [await openStream(other.base), await openStream(other.base), await openStream(other.base)]
      await waitFor(() => other.events.size() === 3)
      const before = pings(streamsOpen[0])
      await new Promise((resolve) => setTimeout(resolve, 1000))
      // About 10 from one timer; a timer per client would send about 30.
      const counted = pings(streamsOpen[0]) - before
      assert.ok(counted >= 5 && counted <= 15, `${counted} pings in a second`)
      for (const stream of streamsOpen) stream.close()
    } finally {
      await other.close()
    }
  })

  it('drops a client whose connection closes', async () => {
    const other = await serve({})
    try {
      const first = await openStream(other.base)
      const second = await openStream(other.base)
      await waitFor(() => other.events.size() === 2)
      first.close()
      await waitFor(() => other.events.size() === 1)
      other.events.publish('library')
      await waitFor(() => changes(second) === 1)
      second.close()
      await waitFor(() => other.events.size() === 0)
    } finally {
      await other.close()
    }
  })

  it('answers 503 beyond maxClients and takes a client again once one leaves', async () => {
    const other = await serve({ maxClients: 2 })
    try {
      const open = [await openStream(other.base), await openStream(other.base)]
      await waitFor(() => other.events.size() === 2)
      const refused = await fetch(`${other.base}/api/events`)
      assert.equal(refused.status, 503)
      assert.deepEqual(await refused.json(), { error: 'Too many open pages' })
      assert.equal(other.events.size(), 2)

      open[0].close()
      await waitFor(() => other.events.size() === 1)
      const again = await openStream(other.base)
      assert.equal(again.response.status, 200)
      open[1].close()
      again.close()
    } finally {
      await other.close()
    }
  })
})

// Starts a long poll; answers its status, body, Cache-Control and how long it took.
function poll(base, query, signal) {
  const started = performance.now()
  return fetch(`${base}/api/changes${query}`, { signal }).then(async (response) => ({
    status: response.status,
    body: await response.json(),
    cache: response.headers.get('cache-control'),
    ms: performance.now() - started,
  }))
}

describe('GET /api/changes', { timeout: 15_000 }, () => {
  it('answers the version at once when since is absent, not a number or another version', async () => {
    const before = Date.now()
    const other = await serve({})
    try {
      const first = await poll(other.base, '?wait=30')
      assert.equal(first.status, 200)
      assert.equal(first.cache, 'no-store')
      const { version } = first.body
      assert.ok(Number.isInteger(version) && version >= before && version <= Date.now(), String(version))
      for (const query of ['?since=abc&wait=30', `?since=${version - 1}&wait=30`, `?since=${version + 1}`, '?since=&wait=30']) {
        const answer = await poll(other.base, query)
        assert.deepEqual([answer.status, answer.body, answer.cache], [200, { version }, 'no-store'], query)
        assert.ok(answer.ms < 1000, `${query} took ${answer.ms} ms`)
      }
    } finally {
      await other.close()
    }
  })

  it('holds a request for the current version and answers the next write with the new one', async () => {
    app.db.exec("INSERT INTO authors (id, name) VALUES (1, 'Jane Austen'); INSERT INTO books (id, title, author_id) VALUES (1, 'Emma', 1)")
    const other = await serve({})
    try {
      const { version } = (await poll(other.base, '')).body
      const held = poll(other.base, `?since=${version}&wait=30`)
      await waitFor(() => other.events.size() === 1)
      await settle()
      assert.equal(other.events.size(), 1)

      assert.equal((await fetch(`${other.base}/api/books/1`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ read: true }) })).status, 200)
      const answer = await held
      assert.deepEqual([answer.status, answer.body, answer.cache], [200, { version: version + 1 }, 'no-store'])
      assert.equal(other.events.size(), 0)
    } finally {
      await other.close()
    }
  })

  it('answers a held request once when two changes come together', async () => {
    const other = await serve({})
    try {
      const { version } = (await poll(other.base, '')).body
      const held = poll(other.base, `?since=${version}&wait=30`)
      await waitFor(() => other.events.size() === 1)
      other.events.publish('library')
      other.events.publish('library')
      assert.deepEqual((await held).body, { version: version + 1 })
      assert.deepEqual((await poll(other.base, '')).body, { version: version + 2 })
    } finally {
      await other.close()
    }
  })

  it('answers the same version once the wait runs out with no change', async () => {
    const other = await serve({ secondMs: 20 })
    try {
      const { version } = (await poll(other.base, '')).body
      const answer = await poll(other.base, `?since=${version}&wait=5`)
      assert.deepEqual([answer.status, answer.body, answer.cache], [200, { version }, 'no-store'])
      assert.ok(answer.ms >= 90, `answered after ${answer.ms} ms`)
      assert.equal(other.events.size(), 0)
    } finally {
      await other.close()
    }
  })

  it('waits 25 seconds by default, at most 30 and at least none', async () => {
    const other = await serve({ secondMs: 50 })
    try {
      const { version } = (await poll(other.base, '')).body
      const order = []
      const hold = (label, wait) => poll(other.base, `?since=${version}${wait}`).then((answer) => {
        order.push(label)
        return answer
      })
      const answers = await Promise.all([hold('3600', '&wait=3600'), hold('28', '&wait=28'), hold('default', ''), hold('-5', '&wait=-5'), hold('empty', '&wait=')])
      assert.deepEqual(order.filter((label) => label !== 'empty'), ['-5', 'default', '28', '3600'])
      assert.ok(answers[0].ms >= 1450, `wait=3600 answered after ${answers[0].ms} ms`)
      assert.ok(answers[4].ms >= 1200, `an empty wait answered after ${answers[4].ms} ms`)
      for (const answer of answers) assert.deepEqual(answer.body, { version })
    } finally {
      await other.close()
    }
  })

  it('ends the hold when the client closes', async () => {
    const other = await serve({})
    try {
      const { version } = (await poll(other.base, '')).body
      const controller = new AbortController()
      const held = poll(other.base, `?since=${version}&wait=30`, controller.signal).catch((err) => err.name)
      await waitFor(() => other.events.size() === 1)
      controller.abort()
      assert.equal(await held, 'AbortError')
      await waitFor(() => other.events.size() === 0)
      other.events.publish('library')
      assert.deepEqual((await poll(other.base, '')).body, { version: version + 1 })
    } finally {
      await other.close()
    }
  })

  it('counts a held request against maxClients with the streams', async () => {
    const other = await serve({ maxClients: 2 })
    try {
      const { version } = (await poll(other.base, '')).body
      const stream = await openStream(other.base)
      const controller = new AbortController()
      const held = poll(other.base, `?since=${version}&wait=30`, controller.signal).catch((err) => err.name)
      await waitFor(() => other.events.size() === 2)

      assert.equal((await fetch(`${other.base}/api/events`)).status, 503)
      const refused = await poll(other.base, `?since=${version}&wait=30`)
      assert.deepEqual([refused.status, refused.body], [503, { error: 'Too many open pages' }])
      assert.deepEqual((await poll(other.base, '')).body, { version })

      controller.abort()
      await held
      await waitFor(() => other.events.size() === 1)
      assert.equal((await openStream(other.base)).response.status, 200)
      stream.close()
    } finally {
      await other.close()
    }
  })
})
