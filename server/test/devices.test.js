/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, it } from 'node:test'
import { send } from './support/http.js'
import { startServer } from './support/server.js'

const { createSettings } = await import('../src/settings.js')
const { hashPassword } = await import('../src/auth.js')

const ADMIN_PASSWORD = 'the admin password'
const KEY = crypto.randomBytes(32)
const MINUTE = 60 * 1000
const clock = { time: Date.parse('2026-10-25T12:00:00Z') }
const now = () => clock.time
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex')
const iso = (ms) => new Date(ms).toISOString()

let app
let settings
let admin
const responses = []
const logged = []
const console_ = {}

before(async () => {
  for (const level of ['log', 'info', 'warn', 'error']) {
    console_[level] = console[level]
    console[level] = (...args) => logged.push(args.map(String).join(' '))
  }
  app = await startServer((db) => {
    settings = createSettings(db, { secretKey: () => KEY, env: {} })
    return { settings, now, secure: false }
  })
})
after(async () => {
  Object.assign(console, console_)
  await app.close()
})
beforeEach(async () => {
  app.db.exec('DELETE FROM devices; DELETE FROM sessions')
  // Past every pending pairing and every per-minute count of the test before.
  clock.time += 60 * MINUTE
  settings.set('admin_password_hash', hashPassword(ADMIN_PASSWORD))
  const { status, headers } = await send(app.base, 'POST', '/api/admin/login', { body: { password: ADMIN_PASSWORD } })
  assert.equal(status, 204)
  admin = headers['set-cookie'][0].split(';')[0]
})

// Every answer is kept, raw, for the test that looks for a token in them; a poll answer that hands
// a token over is kept apart.
const tokenAnswers = []
async function call(method, url, options) {
  const answer = await send(app.base, method, url, options)
  const record = [answer.text, JSON.stringify(answer.headers)].join('\n')
  if (method === 'GET' && url.startsWith('/api/devices/pair/') && answer.status === 200) tokenAnswers.push(record)
  else responses.push(record)
  return answer
}

const pair = (localAddress) => call('POST', '/api/devices/pair', { localAddress })
const poll = (handle) => call('GET', `/api/devices/pair/${handle}`)
const approve = (code, name = 'Living room') => call('POST', '/api/admin/devices', { body: { code, name }, cookie: admin })

let addresses = 0
async function paired(name) {
  addresses += 1
  const { body: { code, poll: handle } } = await pair(`127.0.1.${addresses}`)
  const approved = await approve(code, name)
  assert.equal(approved.status, 201)
  const { body: { token } } = await poll(handle)
  return { id: approved.body.id, token }
}

describe('pairing a television', () => {
  it('answers a six-digit code and a poll handle, waits, and hands the token over once when approved', async () => {
    const started = await pair()
    assert.equal(started.status, 200)
    assert.deepEqual(Object.keys(started.body), ['code', 'poll'])
    assert.match(started.body.code, /^\d{6}$/)
    assert.match(started.body.poll, /^[A-Za-z0-9_-]{32}$/)
    assert.equal(started.headers['cache-control'], 'no-store')

    const waiting = await poll(started.body.poll)
    assert.deepEqual([waiting.status, waiting.text, waiting.headers['cache-control']], [204, '', 'no-store'])

    const spaced = `${started.body.code.slice(0, 3)} ${started.body.code.slice(3)}`
    const approved = await approve(spaced, '  Living room  ')
    assert.equal(approved.status, 201)
    assert.deepEqual(approved.body, { id: approved.body.id, name: 'Living room', created_at: iso(clock.time) })
    assert.equal((await approve(started.body.code, 'Again')).status, 404)
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM devices').pluck().get(), 1)

    const handed = await poll(started.body.poll)
    assert.equal(handed.status, 200)
    assert.deepEqual(Object.keys(handed.body), ['token'])
    assert.match(handed.body.token, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(handed.headers['cache-control'], 'no-store')
    assert.deepEqual(app.db.prepare('SELECT token_hash FROM devices').pluck().all(), [sha256(handed.body.token)])

    const gone = await poll(started.body.poll)
    assert.deepEqual([gone.status, gone.body], [410, { error: 'This code has expired; ask for a new one' }])
    assert.equal((await approve(started.body.code)).status, 404)
  })

  it('forgets a pairing after 10 minutes', async () => {
    const started = await pair()
    clock.time += 10 * MINUTE - 1
    assert.equal((await poll(started.body.poll)).status, 204)
    clock.time += 1
    assert.equal((await poll(started.body.poll)).status, 410)
    const late = await approve(started.body.code)
    assert.deepEqual([late.status, late.body], [404, { error: 'No television is showing that code' }])
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM devices').pluck().get(), 0)
  })

  it('answers 404 for a code no television shows and 400 naming a bad field', async () => {
    const { body: { code } } = await pair()
    const other = String((Number(code) + 1) % 1_000_000).padStart(6, '0')
    assert.deepEqual(await approve(other).then(({ status, body }) => [status, body]), [404, { error: 'No television is showing that code' }])
    for (const [body, error] of [
      [{ code: '12345', name: 'TV' }, 'code must be six digits'],
      [{ code: '12345a', name: 'TV' }, 'code must be six digits'],
      [{ code: 123456, name: 'TV' }, 'code must be six digits'],
      [{ code, name: '' }, 'name must not be empty'],
      [{ code, name: 'x'.repeat(65) }, 'name is longer than 64 characters'],
      [{ code }, 'name must be a string'],
    ]) {
      const result = await call('POST', '/api/admin/devices', { body, cookie: admin })
      assert.deepEqual([result.status, result.body], [400, { error }], JSON.stringify(body))
    }
    assert.equal((await approve(code)).status, 201)
    assert.equal((await poll('not-a-handle-anyone-was-given')).status, 410)
  })

  it('starts at most 3 pairings a minute from one address', async () => {
    for (let i = 0; i < 3; i++) assert.equal((await pair('127.0.0.40')).status, 200)
    clock.time += 20 * 1000
    const refused = await pair('127.0.0.40')
    assert.deepEqual([refused.status, refused.body], [429, { error: 'Too many pairing codes from this address; try again in a minute' }])
    assert.equal(refused.headers['retry-after'], '40')
    assert.equal((await pair('127.0.0.41')).status, 200)
    clock.time += 40 * 1000
    assert.equal((await pair('127.0.0.40')).status, 200)
  })

  it('keeps at most 20 pairings waiting at once', async () => {
    const first = clock.time
    for (let i = 0; i < 20; i++) assert.equal((await pair(`127.0.2.${i + 1}`)).status, 200, String(i))
    clock.time += MINUTE
    const full = await pair('127.0.2.100')
    assert.deepEqual([full.status, full.body], [503, { error: 'Too many televisions are pairing; try again later' }])
    assert.equal(full.headers['retry-after'], String((first + 10 * MINUTE - clock.time) / 1000))
    clock.time = first + 10 * MINUTE
    assert.equal((await pair('127.0.2.100')).status, 200)
  })
})

describe('a paired television', () => {
  it('reads the API with its token, and is stamped as seen at most once an hour', async () => {
    const { id, token } = await paired('Living room')
    const seen = () => app.db.prepare('SELECT last_seen_at FROM devices WHERE id = ?').pluck().get(id)
    assert.equal(seen(), null)
    assert.equal((await call('GET', '/api/display', { bearer: token })).status, 200)
    const first = seen()
    assert.equal(first, iso(clock.time))
    clock.time += 59 * MINUTE
    assert.equal((await call('GET', '/api/changes', { bearer: token })).status, 200)
    assert.equal(seen(), first)
    clock.time += MINUTE
    assert.equal((await call('GET', '/api/display', { bearer: token })).status, 200)
    assert.equal(seen(), iso(clock.time))
    assert.equal((await call('GET', '/api/session', { bearer: token })).status, 401)
  })

  it('is listed on the admin page, and once removed its next request is a 401', async () => {
    const kitchen = await paired('Kitchen')
    clock.time += 1000
    const lounge = await paired('Lounge')
    await call('GET', '/api/display', { bearer: lounge.token })
    const listed = await call('GET', '/api/admin/devices', { cookie: admin })
    assert.equal(listed.status, 200)
    assert.deepEqual(listed.body.map(({ name, last_seen_at }) => [name, last_seen_at]), [['Kitchen', null], ['Lounge', iso(clock.time)]])
    assert.deepEqual(Object.keys(listed.body[0]), ['id', 'name', 'created_at', 'last_seen_at'])

    assert.equal((await call('DELETE', `/api/admin/devices/${lounge.id}`, { cookie: admin })).status, 204)
    assert.deepEqual(await call('GET', '/api/display', { bearer: lounge.token }).then(({ status, body }) => [status, body]), [401, { error: 'Sign in' }])
    assert.equal((await call('GET', '/api/display', { bearer: kitchen.token })).status, 200)
    assert.equal((await call('DELETE', `/api/admin/devices/${lounge.id}`, { cookie: admin })).status, 404)
    assert.equal((await call('DELETE', '/api/admin/devices/abc', { cookie: admin })).status, 404)
  })

  it('never finds its token in any answer but the one poll, or in any log line', async () => {
    const { token } = await paired('Bedroom')
    await call('GET', '/api/display', { bearer: token })
    await call('GET', '/api/admin/devices', { cookie: admin })
    await call('POST', '/api/books', { bearer: token, body: { title: '' } })
    await call('GET', '/api/nothing', { bearer: `${token}x` })
    await call('PATCH', '/api/books/999', { bearer: token, body: { read: true } })
    assert.ok(tokenAnswers.some((record) => record.includes(token)))
    const seen = `${responses.join('\n')}\n${logged.join('\n')}`
    for (const answer of tokenAnswers) {
      const handed = JSON.parse(answer.split('\n')[0]).token
      assert.ok(!seen.includes(handed), 'a token outside its poll answer')
      assert.ok(!seen.includes(sha256(handed)), "a token's hash in an answer or a log")
    }
  })
})
