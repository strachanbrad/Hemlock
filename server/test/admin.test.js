/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { loadApp, startServer } from './support/server.js'
import { tempDir } from './support/temp.js'

const { createSettings } = await import('../src/settings.js')
const { hashPassword, verifyPassword } = await import('../src/auth.js')
const { probeGoogle } = await import('../src/lookup/google.js')

const PASSWORD = 'correct horse battery'
const GOOGLE = 'google-test-key-0123456789abcd'
const CLAUDE = 'sk-ant-test-CLAUDE-SECRET-0123456789abcd'
const KEY = crypto.randomBytes(32)
const clock = { time: Date.parse('2026-10-25T12:00:00Z') }
const now = () => clock.time
const probed = []
let probeAnswer = () => ({ ok: true, detail: 'fine' })
const probes = {
  google: async (key) => {
    probed.push(['google', key])
    return probeAnswer(key)
  },
  anthropic: async (key) => {
    probed.push(['anthropic', key])
    return probeAnswer(key)
  },
}

let app
let settings
const responses = []

before(async () => {
  app = await startServer((db) => {
    settings = createSettings(db, { secretKey: () => KEY, env: {} })
    return { settings, probes, now, secure: false }
  })
})
after(() => app.close())
beforeEach(() => {
  app.db.exec('DELETE FROM sessions; DELETE FROM settings')
  settings.set('admin_password_hash', hashPassword(PASSWORD))
  probed.length = 0
  probeAnswer = () => ({ ok: true, detail: 'fine' })
  clock.time += 60 * 60 * 1000
})

async function call(method, url, { body, cookie, raw } = {}) {
  const headers = {}
  if (cookie) headers.Cookie = cookie
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(app.base + url, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) })
  const text = await response.text()
  responses.push(text, JSON.stringify([...response.headers]))
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers }
}

async function signIn() {
  const { status, headers } = await call('POST', '/api/admin/login', { body: { password: PASSWORD } })
  assert.equal(status, 204)
  return headers.get('set-cookie').split(';')[0]
}

describe('admin login', () => {
  it('sets an HttpOnly, SameSite=Strict cookie on /api/admin for 30 days and keeps only its hash', async () => {
    const { status, headers } = await call('POST', '/api/admin/login', { body: { password: PASSWORD } })
    assert.equal(status, 204)
    const cookie = headers.get('set-cookie')
    assert.match(cookie, /^hemlock_admin=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict; Path=\/api\/admin; Max-Age=2592000$/)
    const token = cookie.split(';')[0].split('=')[1]
    const rows = app.db.prepare('SELECT * FROM sessions').all()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].token_hash, crypto.createHash('sha256').update(token).digest('hex'))
    assert.equal(Date.parse(rows[0].expires_at) - Date.parse(rows[0].created_at), 30 * 24 * 60 * 60 * 1000)
    assert.ok(!JSON.stringify(rows).includes(token))
  })

  it('marks the cookie Secure in production', async () => {
    const { createApp } = await loadApp()
    const server = await new Promise((resolve) => {
      const listening = createApp({ db: app.db, settings, probes, now, secure: true }).listen(0, '127.0.0.1', () => resolve(listening))
    })
    try {
      const base = `http://127.0.0.1:${server.address().port}/api/admin`
      const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) })
      assert.match(login.headers.get('set-cookie'), /^hemlock_admin=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict; Path=\/api\/admin; Max-Age=2592000; Secure$/)
      const out = await fetch(`${base}/logout`, { method: 'POST' })
      assert.equal(out.headers.get('set-cookie'), 'hemlock_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0; Secure')
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('answers 401 for a wrong password and 400 for no password', async () => {
    assert.deepEqual(await call('POST', '/api/admin/login', { body: { password: 'wrong password' } }).then(({ status, body }) => ({ status, body })), { status: 401, body: { error: 'Wrong password' } })
    for (const body of [{}, { password: '' }, { password: 12345678 }, { password: 'x'.repeat(1025) }]) {
      assert.equal((await call('POST', '/api/admin/login', { body })).status, 400, JSON.stringify(body))
    }
    assert.equal((await call('POST', '/api/admin/login', { raw: 'password=correct', body: undefined })).status, 400)
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 0)
  })

  it('answers 503 naming the command when no password is set', async () => {
    settings.clear('admin_password_hash')
    const { status, body } = await call('POST', '/api/admin/login', { body: { password: PASSWORD } })
    assert.equal(status, 503)
    assert.match(body.error, /npm run admin:password/)
  })

  it('locks the login for 15 minutes after 5 failures, even for the right password', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/admin/login', { body: { password: `wrong ${i}` } })).status, 401)
    const locked = await call('POST', '/api/admin/login', { body: { password: PASSWORD } })
    assert.equal(locked.status, 429)
    assert.equal(locked.headers.get('retry-after'), '900')
    assert.match(locked.body.error, /Too many wrong passwords/)
    clock.time += 10 * 60 * 1000
    assert.equal((await call('POST', '/api/admin/login', { body: { password: PASSWORD } })).headers.get('retry-after'), '300')
    clock.time += 5 * 60 * 1000
    assert.equal((await call('POST', '/api/admin/login', { body: { password: PASSWORD } })).status, 204)
  })

  it('deletes expired sessions on login and refuses an expired cookie', async () => {
    const old = await signIn()
    assert.equal((await call('GET', '/api/admin/session', { cookie: old })).status, 200)
    clock.time += 31 * 24 * 60 * 60 * 1000
    assert.equal((await call('GET', '/api/admin/session', { cookie: old })).status, 401)
    await signIn()
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 1)
  })

  it('signs out: deletes the row and clears the cookie', async () => {
    const cookie = await signIn()
    assert.deepEqual((await call('GET', '/api/admin/session', { cookie })).body, { admin: true })
    const out = await call('POST', '/api/admin/logout', { cookie })
    assert.equal(out.status, 204)
    assert.equal(out.headers.get('set-cookie'), 'hemlock_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0')
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 0)
    assert.equal((await call('GET', '/api/admin/session', { cookie })).status, 401)
  })
})

describe('admin routes without a session', () => {
  const routes = [
    ['GET', '/api/admin/session'],
    ['GET', '/api/admin/settings'],
    ['PUT', '/api/admin/settings', { google_books_api_key: 'new' }],
    ['POST', '/api/admin/settings/test', { service: 'google' }],
    ['GET', '/api/admin/anything'],
  ]

  it('answers 401 before doing anything', async () => {
    settings.set('google_books_api_key', GOOGLE)
    for (const cookie of [undefined, 'hemlock_admin=not-a-token', `hemlock_admin=${'A'.repeat(43)}`, 'other=1']) {
      for (const [method, url, body] of routes) {
        const result = await call(method, url, { body, cookie })
        assert.deepEqual({ status: result.status, body: result.body }, { status: 401, body: { error: 'Not signed in' } }, `${method} ${url} ${cookie}`)
      }
    }
    assert.equal(settings.get('google_books_api_key'), GOOGLE)
    assert.deepEqual(probed, [])
  })
})

describe('admin settings', () => {
  let cookie
  beforeEach(async () => {
    cookie = await signIn()
  })
  const put = (body) => call('PUT', '/api/admin/settings', { body, cookie })

  it('lists the four settings as statuses, never a secret', async () => {
    settings.set('google_books_api_key', GOOGLE)
    settings.set('anthropic_api_key', CLAUDE)
    const { status, body } = await call('GET', '/api/admin/settings', { cookie })
    assert.equal(status, 200)
    assert.deepEqual(body, {
      google_books_api_key: { is_set: true, source: 'settings', hint: 'abcd' },
      anthropic_api_key: { is_set: true, source: 'settings', hint: 'abcd' },
      anthropic_model: { is_set: false, source: null, hint: null },
      lookup_contact: { is_set: false, source: null, hint: null },
    })
  })

  it('sets a non-empty string, clears on null, and leaves an absent key or an empty string alone', async () => {
    settings.set('lookup_contact', 'old@example.org')
    const set = await put({ google_books_api_key: `  ${GOOGLE}  `, anthropic_model: 'claude-sonnet-5-5', anthropic_api_key: '' })
    assert.equal(set.status, 200)
    assert.equal(settings.get('google_books_api_key'), GOOGLE)
    assert.equal(settings.get('anthropic_api_key'), null)
    assert.equal(settings.get('lookup_contact'), 'old@example.org')
    assert.deepEqual(set.body.anthropic_model, { is_set: true, source: 'settings', hint: 'claude-sonnet-5-5' })
    assert.deepEqual(set.body.lookup_contact, { is_set: true, source: 'settings', hint: 'old@example.org' })
    const cleared = await put({ lookup_contact: null, google_books_api_key: '   ' })
    assert.deepEqual(cleared.body.lookup_contact, { is_set: false, source: null, hint: null })
    assert.equal(settings.get('google_books_api_key'), GOOGLE)
  })

  it('refuses a bad value naming the field, and changes nothing', async () => {
    const cases = [
      [{ anthropic_api_key: 'two words' }, 'anthropic_api_key must not contain spaces'],
      [{ anthropic_api_key: 'x'.repeat(257) }, 'anthropic_api_key is longer than 256 characters'],
      [{ anthropic_model: 'Claude Opus' }, 'anthropic_model must not contain spaces'],
      [{ anthropic_model: 'claude_opus' }, 'anthropic_model may hold only lowercase letters, digits, dots and hyphens'],
      [{ lookup_contact: 'owner' }, 'lookup_contact is not an email address'],
      [{ lookup_contact: 42 }, 'lookup_contact must be a string or null'],
      [{ admin_password_hash: 'x' }, 'Unknown setting: admin_password_hash'],
      [{ anthropic_base_url: 'https://evil.test' }, 'Unknown setting: anthropic_base_url'],
    ]
    for (const [body, error] of cases) {
      const result = await put({ google_books_api_key: GOOGLE, ...body })
      assert.deepEqual({ status: result.status, body: result.body }, { status: 400, body: { error } }, JSON.stringify(body))
    }
    const array = await put([GOOGLE])
    assert.deepEqual({ status: array.status, body: array.body }, { status: 400, body: { error: 'The settings must be a JSON object' } })
    assert.equal(settings.get('google_books_api_key'), null)
  })

  it('tests what is saved, not the form, and answers 503 when nothing is set', async () => {
    const none = await call('POST', '/api/admin/settings/test', { body: { service: 'google' }, cookie })
    assert.deepEqual({ status: none.status, body: none.body }, { status: 503, body: { error: 'No Google Books key is set' } })
    assert.equal((await call('POST', '/api/admin/settings/test', { body: { service: 'anthropic' }, cookie })).status, 503)
    settings.set('anthropic_api_key', CLAUDE)
    const ok = await call('POST', '/api/admin/settings/test', { body: { service: 'anthropic', anthropic_api_key: 'from-the-form' }, cookie })
    assert.equal(ok.status, 200)
    assert.deepEqual({ ...ok.body, latency_ms: typeof ok.body.latency_ms }, { ok: true, latency_ms: 'number', detail: 'fine' })
    assert.deepEqual(probed, [['anthropic', CLAUDE]])
    assert.equal((await call('POST', '/api/admin/settings/test', { body: { service: 'openai' }, cookie })).status, 400)
  })

  it("answers 502 with the provider's message, the key replaced by [redacted]", async () => {
    settings.set('google_books_api_key', GOOGLE)
    probeAnswer = (key) => ({ ok: false, error: `Google Books answered HTTP 400: API key not valid: ${key}` })
    const failed = await call('POST', '/api/admin/settings/test', { body: { service: 'google' }, cookie })
    assert.deepEqual({ status: failed.status, body: failed.body }, { status: 502, body: { error: 'Google Books answered HTTP 400: API key not valid: [redacted]' } })
    probeAnswer = () => {
      throw new Error(`boom ${GOOGLE}`)
    }
    assert.deepEqual((await call('POST', '/api/admin/settings/test', { body: { service: 'google' }, cookie })).body, { error: 'boom [redacted]' })
  })

  it('never puts a saved key in any response', async () => {
    await put({ google_books_api_key: GOOGLE, anthropic_api_key: CLAUDE })
    await call('GET', '/api/admin/settings', { cookie })
    probeAnswer = (key) => ({ ok: true, detail: `answered for ${key}` })
    assert.equal((await call('POST', '/api/admin/settings/test', { body: { service: 'anthropic' }, cookie })).body.detail, 'answered for [redacted]')
    const seen = responses.join('\n')
    assert.ok(!seen.includes(GOOGLE))
    assert.ok(!seen.includes(CLAUDE))
  })
})

describe('probeGoogle', () => {
  it('asks for one known ISBN with the key and counts the volumes', async () => {
    const urls = []
    const fetch = async (url) => {
      urls.push(url)
      return new Response(JSON.stringify({ kind: 'books#volumes', totalItems: 2, items: [] }), { headers: { 'content-type': 'application/json' } })
    }
    assert.deepEqual(await probeGoogle({ fetch, key: GOOGLE, userAgent: 'Hemlock/test' }), { ok: true, detail: '2 volumes for ISBN 9780553212587' })
    assert.deepEqual(urls, [`https://www.googleapis.com/books/v1/volumes?q=isbn:9780553212587&key=${GOOGLE}`])
  })

  it("reports Google's own error message", async () => {
    const fetch = async () => new Response(JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } }), { status: 400, headers: { 'content-type': 'application/json' } })
    assert.deepEqual(await probeGoogle({ fetch, key: GOOGLE, userAgent: 'Hemlock/test' }), { ok: false, error: 'Google Books answered HTTP 400: API key not valid. Please pass a valid API key.' })
  })
})

describe('npm run admin:password', () => {
  const script = path.join(import.meta.dirname, '../scripts/admin-password.js')
  const run = (input, args = [], dir = tempDir()) => ({ dir, ...spawnSync(process.execPath, [script, ...args], { input, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir, SECRETS_KEY: '' } }) })

  it('reads one piped line, stores its scrypt hash and ends every session', async () => {
    const { openDb } = await import('../src/db.js')
    const { secretKeyLoader } = await import('../src/settings.js')
    const dir = tempDir()
    const seeded = openDb(dir)
    seeded.prepare("INSERT INTO sessions VALUES ('a', '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z')").run()
    seeded.close()
    const result = run('a new password\nignored second line\n', [], dir)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /^Admin password set in .*hemlock\.db; 1 session ended\n$/)
    const db = openDb(dir)
    try {
      const stored = createSettings(db, { secretKey: secretKeyLoader({ secretsKey: null, dataDir: dir }), env: {} }).get('admin_password_hash')
      assert.match(stored, /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/)
      assert.ok(verifyPassword('a new password', stored))
      assert.ok(!verifyPassword('a new passwor', stored))
      // A stored hash that decodes to no bytes must not match every password.
      assert.ok(!verifyPassword('a new password', 'scrypt$32768$8$1$c2FsdHNhbHRzYWx0c2FsdA$!'))
      assert.equal(db.prepare('SELECT COUNT(*) FROM sessions').pluck().get(), 0)
      assert.equal(fs.statSync(path.join(dir, 'secrets.key')).mode & 0o777, 0o600)
    } finally {
      db.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses a password shorter than 8 characters and any argument', () => {
    const short = run('seven77\n')
    assert.equal(short.status, 1)
    assert.match(short.stderr, /at least 8 characters/)
    assert.ok(!fs.existsSync(path.join(short.dir, 'hemlock.db')))
    const argued = run('', ['a-password-on-argv'])
    assert.equal(argued.status, 2)
    assert.match(argued.stderr, /usage: npm run admin:password/)
    for (const dir of [short.dir, argued.dir]) fs.rmSync(dir, { recursive: true, force: true })
  })
})
