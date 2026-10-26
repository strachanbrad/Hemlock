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
import { send } from './support/http.js'
import { loadApp, startServer } from './support/server.js'
import { tempDir } from './support/temp.js'

const { createUsers } = await import('../src/users.js')
const { createSettings } = await import('../src/settings.js')
const { hashPassword, verifyPassword } = await import('../src/auth.js')

const PASSWORD = 'correct horse battery'
const ADMIN_PASSWORD = 'the admin password'
const DAY = 24 * 60 * 60 * 1000
const COOKIE = /^hemlock_session=([A-Za-z0-9_-]{43}); HttpOnly; SameSite=Lax; Path=\/; Max-Age=15552000$/
const KEY = crypto.randomBytes(32)
const clock = { time: Date.parse('2026-10-25T12:00:00Z') }
const now = () => clock.time
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex')
const looked = []

let app
let users
let settings
const responses = []

before(async () => {
  app = await startServer((db) => {
    settings = createSettings(db, { secretKey: () => KEY, env: {} })
    return {
      settings,
      now,
      secure: false,
      lookup: async (isbn) => {
        looked.push(isbn)
        return { status: 200, body: { isbn } }
      },
    }
  })
  users = createUsers(app.db, { now })
})
after(() => app.close())
beforeEach(() => {
  app.db.exec('DELETE FROM user_sessions; DELETE FROM users; DELETE FROM devices; DELETE FROM sessions; DELETE FROM settings; DELETE FROM editions; DELETE FROM books; DELETE FROM authors')
  looked.length = 0
  // A day apart, so no lockout window from one test reaches the next.
  clock.time += DAY
})

async function call(method, url, options) {
  const answer = await send(app.base, method, url, options)
  responses.push(answer.text, JSON.stringify(answer.headers))
  return answer
}

const login = (name, password, options) => call('POST', '/api/login', { body: { name, password }, ...options })

async function signIn(name = 'Ana', password = PASSWORD) {
  const { status, headers } = await login(name, password)
  assert.equal(status, 200)
  return headers['set-cookie'][0].split(';')[0]
}

async function adminCookie() {
  settings.set('admin_password_hash', hashPassword(ADMIN_PASSWORD))
  const { status, headers } = await call('POST', '/api/admin/login', { body: { password: ADMIN_PASSWORD } })
  assert.equal(status, 204)
  return headers['set-cookie'][0].split(';')[0]
}

describe('createUsers', () => {
  it('adds a user with a trimmed name and a scrypt hash, and lists no hash', () => {
    const added = users.add('  Ana  ', PASSWORD)
    assert.deepEqual(added, { id: added.id, name: 'Ana', created_at: new Date(clock.time).toISOString(), last_login_at: null })
    const stored = app.db.prepare('SELECT password_hash FROM users WHERE id = ?').pluck().get(added.id)
    assert.match(stored, /^scrypt\$32768\$8\$1\$/)
    assert.ok(verifyPassword(PASSWORD, stored))
    assert.ok(!stored.includes(PASSWORD))
    users.add('bo', 'another password')
    assert.deepEqual(users.list().map(({ name }) => name), ['Ana', 'bo'])
    assert.deepEqual(Object.keys(users.list()[0]), ['id', 'name', 'created_at', 'last_login_at'])
  })

  it('refuses a name already taken in any case, and a bad name or password', () => {
    users.add('Ana', PASSWORD)
    assert.throws(() => users.add('ANA', 'something else'), { status: 409, message: 'The name ANA is taken' })
    const cases = [
      [['', PASSWORD], 'name must not be empty'],
      [['   ', PASSWORD], 'name must not be empty'],
      [['x'.repeat(65), PASSWORD], 'name is longer than 64 characters'],
      [['a\u0007b', PASSWORD], 'name must not contain control characters'],
      [[42, PASSWORD], 'name must be a string'],
      [['Bo', 'seven77'], 'password needs at least 8 characters'],
      [['Bo', 'x'.repeat(1025)], 'password is longer than 1024 characters'],
      [['Bo', undefined], 'password must be a string'],
    ]
    for (const [args, message] of cases) assert.throws(() => users.add(...args), { status: 400, message }, JSON.stringify(args))
    assert.equal(users.add('é'.repeat(64), PASSWORD).name.length, 64)
    assert.equal(users.list().length, 2)
  })

  it('verifies a password for the name in any case, and refuses a wrong password or an unknown name', () => {
    const { id } = users.add('Ana', PASSWORD)
    assert.deepEqual(users.verify('aNA', PASSWORD), { id, name: 'Ana' })
    assert.equal(users.verify('Ana', 'wrong password'), null)
    assert.equal(users.verify('Nobody', PASSWORD), null)
  })

  it('spends one scrypt on an unknown name, so the timing does not tell which names exist', () => {
    users.add('Ana', PASSWORD)
    users.verify('Nobody', PASSWORD)
    const time = (name) => {
      const started = performance.now()
      users.verify(name, 'a wrong password')
      return performance.now() - started
    }
    const known = Math.min(time('Ana'), time('Ana'))
    const unknown = Math.min(time('Nobody'), time('Nobody'))
    assert.ok(unknown > known / 3, `an unknown name took ${unknown} ms, a known one ${known} ms`)
  })

  it('ends every session of a user whose password is set, and only theirs', () => {
    const ana = users.add('Ana', PASSWORD)
    const bo = users.add('Bo', PASSWORD)
    const first = users.open(ana.id)
    const second = users.open(ana.id)
    const other = users.open(bo.id)
    users.setPassword(ana.id, 'a new password')
    assert.equal(users.user(first), null)
    assert.equal(users.user(second), null)
    assert.equal(users.user(other).name, 'Bo')
    assert.equal(users.verify('Ana', PASSWORD), null)
    assert.ok(users.verify('Ana', 'a new password'))
    assert.throws(() => users.setPassword(ana.id, 'short'), { status: 400 })
    assert.throws(() => users.setPassword(999, 'a new password'), { status: 404 })
  })

  it('ends every session of a user it removes, and only theirs', () => {
    const ana = users.add('Ana', PASSWORD)
    const bo = users.add('Bo', PASSWORD)
    const token = users.open(ana.id)
    const other = users.open(bo.id)
    users.remove(ana.id)
    assert.equal(users.user(token), null)
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM user_sessions WHERE user_id = ?').pluck().get(ana.id), 0)
    assert.equal(users.user(other).name, 'Bo')
    assert.deepEqual(users.list().map(({ name }) => name), ['Bo'])
    assert.throws(() => users.remove(ana.id), { status: 404 })
  })

  it('keeps only the hash of a session token and ignores a malformed one', () => {
    const { id } = users.add('Ana', PASSWORD)
    const token = users.open(id)
    assert.deepEqual(app.db.prepare('SELECT token_hash FROM user_sessions').pluck().all(), [sha256(token)])
    for (const bad of [null, '', 'short', `${token}x`, sha256(token)]) assert.equal(users.user(bad), null, String(bad))
    users.close(token)
    assert.equal(users.user(token), null)
  })
})

describe('POST /api/login', () => {
  it('answers the name with an HttpOnly, SameSite=Lax cookie on / for 180 days, and keeps only its hash', async () => {
    const { id } = users.add('Ana', PASSWORD)
    const { status, body, headers } = await login('  ana ', PASSWORD)
    assert.equal(status, 200)
    assert.deepEqual(body, { name: 'Ana' })
    const [cookie] = headers['set-cookie']
    const [, token] = COOKIE.exec(cookie)
    const rows = app.db.prepare('SELECT * FROM user_sessions').all()
    assert.deepEqual(rows, [{ token_hash: sha256(token), user_id: id, created_at: new Date(clock.time).toISOString(), expires_at: new Date(clock.time + 180 * DAY).toISOString() }])
    assert.equal(users.list()[0].last_login_at, new Date(clock.time).toISOString())
  })

  it('marks the cookie Secure in production, on login and logout', async () => {
    users.add('Ana', PASSWORD)
    const { createApp } = await loadApp()
    const server = await new Promise((resolve) => {
      const listening = createApp({ db: app.db, settings, now, secure: true }).listen(0, '127.0.0.1', () => resolve(listening))
    })
    try {
      const base = `http://127.0.0.1:${server.address().port}/api`
      const signed = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ana', password: PASSWORD }) })
      assert.match(signed.headers.get('set-cookie'), /^hemlock_session=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Lax; Path=\/; Max-Age=15552000; Secure$/)
      const out = await fetch(`${base}/logout`, { method: 'POST' })
      assert.equal(out.headers.get('set-cookie'), 'hemlock_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure')
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('answers 401 for a wrong password or an unknown name, and 400 without both fields', async () => {
    users.add('Ana', PASSWORD)
    for (const [name, password] of [['Ana', 'wrong password'], ['Nobody', PASSWORD]]) {
      const { status, body, headers } = await login(name, password)
      assert.deepEqual({ status, body }, { status: 401, body: { error: 'Wrong name or password' } })
      assert.equal(headers['set-cookie'], undefined)
    }
    for (const body of [{}, { name: 'Ana' }, { password: PASSWORD }, { name: ' ', password: PASSWORD }, { name: 'Ana', password: '' }, { name: 'Ana', password: 12345678 }]) {
      assert.equal((await call('POST', '/api/login', { body })).status, 400, JSON.stringify(body))
    }
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM user_sessions').pluck().get(), 0)
  })

  it('answers 503 naming the command while no user exists', async () => {
    const { status, body } = await login('Ana', PASSWORD)
    assert.deepEqual({ status, body }, { status: 503, body: { error: 'No user exists yet; run npm run user:add on the server' } })
  })

  it('locks a name for 15 minutes after 5 failures, from any address, even for the right password', async () => {
    users.add('Ana', PASSWORD)
    users.add('Bo', PASSWORD)
    for (let i = 0; i < 5; i++) assert.equal((await login('Ana', `wrong ${i}`, { localAddress: `127.0.0.${10 + i}` })).status, 401)
    const locked = await login('ANA', PASSWORD, { localAddress: '127.0.0.20' })
    assert.equal(locked.status, 429)
    assert.equal(locked.headers['retry-after'], '900')
    assert.deepEqual(locked.body, { error: 'Too many wrong passwords; try again in 15 minutes' })
    assert.equal((await login('Bo', PASSWORD, { localAddress: '127.0.0.20' })).status, 200)
    clock.time += 10 * 60 * 1000
    assert.equal((await login('Ana', PASSWORD, { localAddress: '127.0.0.21' })).headers['retry-after'], '300')
    clock.time += 5 * 60 * 1000
    assert.equal((await login('Ana', PASSWORD, { localAddress: '127.0.0.21' })).status, 200)
  })

  it('locks an address for 15 minutes after 5 failures, for every name', async () => {
    users.add('Ana', PASSWORD)
    for (let i = 0; i < 5; i++) assert.equal((await login(`guess${i}`, PASSWORD, { localAddress: '127.0.0.30' })).status, 401)
    const locked = await login('Ana', PASSWORD, { localAddress: '127.0.0.30' })
    assert.equal(locked.status, 429)
    assert.equal(locked.headers['retry-after'], '900')
    assert.equal((await login('Ana', PASSWORD, { localAddress: '127.0.0.31' })).status, 200)
  })
})

describe('the session', () => {
  it('renews at most once a day, sending the cookie again, and ends 180 days after the last renewal', async () => {
    users.add('Ana', PASSWORD)
    const cookie = await signIn()
    const expiry = () => app.db.prepare('SELECT expires_at FROM user_sessions').pluck().get()
    const first = expiry()

    clock.time += 12 * 60 * 60 * 1000
    const soon = await call('GET', '/api/books', { cookie })
    assert.equal(soon.status, 200)
    assert.equal(soon.headers['set-cookie'], undefined)
    assert.equal(expiry(), first)

    clock.time += 12 * 60 * 60 * 1000
    const renewed = await call('GET', '/api/books', { cookie })
    assert.equal(renewed.status, 200)
    assert.equal(renewed.headers['set-cookie'][0].split(';')[0], cookie)
    assert.match(renewed.headers['set-cookie'][0], COOKIE)
    assert.equal(expiry(), new Date(clock.time + 180 * DAY).toISOString())
    assert.equal((await call('GET', '/api/books', { cookie })).headers['set-cookie'], undefined)

    clock.time += 180 * DAY
    assert.deepEqual((await call('GET', '/api/session', { cookie })).body, { error: 'Sign in' })
  })

  it('answers GET /api/session with the name, and 401 without a session', async () => {
    users.add('Ana', PASSWORD)
    const cookie = await signIn('ANA')
    assert.deepEqual(await call('GET', '/api/session', { cookie }).then(({ status, body }) => ({ status, body })), { status: 200, body: { name: 'Ana' } })
    for (const other of [undefined, 'hemlock_session=nonsense', `hemlock_session=${'A'.repeat(43)}`, cookie.replace('hemlock_session', 'hemlock_admin')]) {
      assert.deepEqual(await call('GET', '/api/session', { cookie: other }).then(({ status, body }) => ({ status, body })), { status: 401, body: { error: 'Sign in' } }, other)
    }
  })

  it('signs out: deletes the row and clears the cookie, signed in or not', async () => {
    users.add('Ana', PASSWORD)
    const cookie = await signIn()
    const out = await call('POST', '/api/logout', { cookie })
    assert.equal(out.status, 204)
    assert.deepEqual(out.headers['set-cookie'], ['hemlock_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'])
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM user_sessions').pluck().get(), 0)
    assert.equal((await call('GET', '/api/session', { cookie })).status, 401)
    assert.equal((await call('POST', '/api/logout')).status, 204)
  })

  it('deletes the expired sessions when anyone signs in', async () => {
    users.add('Ana', PASSWORD)
    await signIn()
    await signIn()
    clock.time += 180 * DAY
    await signIn()
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM user_sessions').pluck().get(), 1)
  })

  it('replaces the session a browser already holds when it signs in again', async () => {
    users.add('Ana', PASSWORD)
    const old = await signIn()
    const fresh = await login('Ana', PASSWORD, { cookie: old })
    assert.equal(fresh.status, 200)
    assert.equal((await call('GET', '/api/session', { cookie: old })).status, 401)
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM user_sessions').pluck().get(), 1)
  })
})

describe('the guard', () => {
  const ISBN = '9780553212587'
  const SAMPLE = ['/api/books', `/api/lookup/${ISBN}`, '/api/display', '/api/events', '/api/changes', '/api/authors']

  // The event stream stays open: the status and headers are enough.
  async function status(url, headers = {}) {
    const controller = new AbortController()
    const response = await fetch(app.base + url, { headers, signal: controller.signal })
    const body = response.headers.get('content-type')?.startsWith('application/json') ? await response.json() : null
    controller.abort()
    return { status: response.status, body }
  }

  async function pairedToken() {
    const admin = await adminCookie()
    const { body: { code, poll } } = await call('POST', '/api/devices/pair')
    assert.equal((await call('POST', '/api/admin/devices', { body: { code, name: 'Living room' }, cookie: admin })).status, 201)
    return (await call('GET', `/api/devices/pair/${poll}`)).body.token
  }

  it('answers 401 without a session, 200 with the cookie or a paired TV, and 401 for any other token', async () => {
    users.add('Ana', PASSWORD)
    const cookie = await signIn()
    const unpaired = crypto.randomBytes(32).toString('base64url')
    for (const url of SAMPLE) {
      assert.deepEqual(await status(url), { status: 401, body: { error: 'Sign in' } }, url)
      assert.deepEqual(await status(url, { Authorization: `Bearer ${unpaired}` }), { status: 401, body: { error: 'Sign in' } }, `${url} with no TV paired`)
      assert.equal((await status(url, { Cookie: cookie })).status, 200, url)
    }
    const token = await pairedToken()
    for (const url of SAMPLE) {
      assert.equal((await status(url, { Authorization: `Bearer ${token}` })).status, 200, url)
      assert.equal((await status(url, { Authorization: `bearer ${token}` })).status, 200, url)
      for (const wrong of [unpaired, `${token}x`, token.slice(1), '']) {
        assert.equal((await status(url, { Authorization: `Bearer ${wrong}` })).status, 401, `${url} with a wrong token`)
      }
      assert.equal((await status(url, { Authorization: token })).status, 401, `${url} without the scheme`)
      assert.equal((await status(url, { Cookie: `hemlock_session=${token}` })).status, 401, `${url} with the token as a cookie`)
    }
    assert.deepEqual(looked, [ISBN, ISBN, ISBN])
  })

  it('refuses a write before it runs, so nothing changes', async () => {
    const before = app.db.prepare('SELECT COUNT(*) FROM books').pluck().get()
    const created = await call('POST', '/api/books', { body: { title: 'Emma', author_name: 'Jane Austen' } })
    assert.deepEqual({ status: created.status, body: created.body }, { status: 401, body: { error: 'Sign in' } })
    assert.equal(app.db.prepare('SELECT COUNT(*) FROM books').pluck().get(), before)
    assert.equal((await call('GET', '/api/nothing/here')).status, 401)
    assert.equal((await call('POST', '/api/lookup/9780553212587/identify')).status, 401)
  })

  it('lets the health check, the login, the pairing and the admin gate through on their own', async () => {
    assert.equal((await call('GET', '/api/health')).status, 200)
    assert.equal((await call('POST', '/api/login', { body: {} })).status, 400)
    assert.equal((await call('POST', '/api/logout')).status, 204)
    assert.equal((await call('POST', '/api/devices/pair')).status, 200)
    assert.equal((await call('GET', '/api/devices/pair/unknown')).status, 410)
    assert.deepEqual((await call('GET', '/api/admin/session')).body, { error: 'Not signed in' })
    assert.equal((await call('POST', '/api/admin/login', { body: {} })).status, 400)
    for (const [method, url] of [['HEAD', '/api/health'], ['POST', '/api/LOGIN'], ['POST', '/api/login/'], ['GET', '/api/devices/pair'], ['GET', '/API/books'], ['PUT', '/api/devices/pair'], ['GET', '/api/administrator']]) {
      assert.equal((await call(method, url)).status, 401, `${method} ${url}`)
    }
  })
})

describe('the admin user routes', () => {
  it('answer 401 without the admin cookie, even with a user session', async () => {
    const { id } = users.add('Ana', PASSWORD)
    const cookie = await signIn()
    const routes = [
      ['GET', '/api/admin/users'],
      ['POST', '/api/admin/users', { name: 'Eve', password: PASSWORD }],
      ['PUT', `/api/admin/users/${id}/password`, { password: 'taken over' }],
      ['DELETE', `/api/admin/users/${id}`],
      ['GET', '/api/admin/devices'],
      ['POST', '/api/admin/devices', { code: '123456', name: 'TV' }],
      ['DELETE', '/api/admin/devices/1'],
    ]
    for (const session of [undefined, cookie]) {
      for (const [method, url, body] of routes) {
        const result = await call(method, url, { body, cookie: session })
        assert.deepEqual({ status: result.status, body: result.body }, { status: 401, body: { error: 'Not signed in' } }, `${method} ${url}`)
      }
    }
    assert.deepEqual(users.list().map(({ name }) => name), ['Ana'])
    assert.ok(users.verify('Ana', PASSWORD))
  })

  it('list, add, set a password and remove users, ending their sessions', async () => {
    const admin = await adminCookie()
    const added = await call('POST', '/api/admin/users', { body: { name: ' Ana ', password: PASSWORD }, cookie: admin })
    assert.equal(added.status, 201)
    assert.deepEqual(added.body, { id: added.body.id, name: 'Ana', created_at: new Date(clock.time).toISOString(), last_login_at: null })
    const listed = await call('GET', '/api/admin/users', { cookie: admin })
    assert.deepEqual(listed.body, [added.body])

    const session = await signIn()
    assert.equal((await call('PUT', `/api/admin/users/${added.body.id}/password`, { body: { password: 'a new password' }, cookie: admin })).status, 204)
    assert.equal((await call('GET', '/api/books', { cookie: session })).status, 401)
    assert.equal((await login('Ana', PASSWORD)).status, 401)
    const again = await signIn('Ana', 'a new password')

    assert.equal((await call('DELETE', `/api/admin/users/${added.body.id}`, { cookie: admin })).status, 204)
    assert.equal((await call('GET', '/api/books', { cookie: again })).status, 401)
    assert.deepEqual((await call('GET', '/api/admin/users', { cookie: admin })).body, [])
  })

  it('answer 400 naming the field, 409 for a name taken and 404 for an unknown user', async () => {
    const admin = await adminCookie()
    const { id } = users.add('Ana', PASSWORD)
    const cases = [
      [{ name: '', password: PASSWORD }, 'name must not be empty'],
      [{ password: PASSWORD }, 'name must be a string'],
      [{ name: 'Bo', password: 'seven77' }, 'password needs at least 8 characters'],
      [{ name: 'Bo' }, 'password must be a string'],
    ]
    for (const [body, error] of cases) {
      const result = await call('POST', '/api/admin/users', { body, cookie: admin })
      assert.deepEqual({ status: result.status, body: result.body }, { status: 400, body: { error } }, JSON.stringify(body))
    }
    const taken = await call('POST', '/api/admin/users', { body: { name: 'aNa', password: PASSWORD }, cookie: admin })
    assert.deepEqual({ status: taken.status, body: taken.body }, { status: 409, body: { error: 'The name aNa is taken' } })
    assert.equal((await call('PUT', `/api/admin/users/${id}/password`, { body: { password: 'short' }, cookie: admin })).status, 400)
    for (const [method, url, body] of [['PUT', '/api/admin/users/999/password', { password: PASSWORD }], ['DELETE', '/api/admin/users/999'], ['DELETE', '/api/admin/users/abc']]) {
      assert.equal((await call(method, url, { body, cookie: admin })).status, 404, `${method} ${url}`)
    }
    assert.ok(users.verify('Ana', PASSWORD))
  })

  it('never put a password or a password hash in any response', async () => {
    const admin = await adminCookie()
    await call('POST', '/api/admin/users', { body: { name: 'Ana', password: PASSWORD }, cookie: admin })
    await call('GET', '/api/admin/users', { cookie: admin })
    await login('Ana', PASSWORD)
    await login('Ana', 'a wrong password')
    const seen = responses.join('\n')
    assert.ok(!seen.includes(PASSWORD))
    assert.ok(!seen.includes('a wrong password'))
    assert.ok(!seen.includes('scrypt$'))
  })
})

describe('npm run user:add', () => {
  const script = path.join(import.meta.dirname, '../scripts/user-add.js')
  const run = (input, args, dir = tempDir()) => ({ dir, ...spawnSync(process.execPath, [script, ...args], { input, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir } }) })
  const cleanup = (...dirs) => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
  }

  it('adds the named user with the piped password, which it never prints', async () => {
    const { openDb } = await import('../src/db.js')
    const added = run(`${PASSWORD}\nignored second line\n`, ['  Ana '])
    try {
      assert.equal(added.status, 0, added.stderr)
      assert.match(added.stdout, /^Added Ana to .*hemlock\.db\n$/)
      assert.ok(!`${added.stdout}${added.stderr}`.includes(PASSWORD))
      const db = openDb(added.dir)
      try {
        assert.ok(createUsers(db).verify('ana', PASSWORD))
        assert.equal(createUsers(db).list().length, 1)
      } finally {
        db.close()
      }
      const taken = run(`${PASSWORD}\n`, ['ANA'], added.dir)
      assert.equal(taken.status, 1)
      assert.equal(taken.stderr, 'The name ANA is taken; nothing changed\n')
    } finally {
      cleanup(added.dir)
    }
  })

  it('refuses a short password, a bad name and anything but one argument, creating nothing', () => {
    const short = run('seven77\n', ['Ana'])
    assert.equal(short.status, 1)
    assert.equal(short.stderr, 'Password needs at least 8 characters; nothing changed\n')
    const empty = run(`${PASSWORD}\n`, ['  '])
    assert.equal(empty.status, 1)
    assert.match(empty.stderr, /^Name must not be empty/)
    const none = run('', [])
    const two = run(`${PASSWORD}\n`, ['Ana', PASSWORD])
    for (const result of [none, two]) {
      assert.equal(result.status, 2)
      assert.match(result.stderr, /usage: npm run user:add <name>/)
    }
    for (const result of [short, empty, none, two]) assert.ok(!fs.existsSync(path.join(result.dir, 'hemlock.db')))
    cleanup(short.dir, empty.dir, none.dir, two.dir)
  })
})
