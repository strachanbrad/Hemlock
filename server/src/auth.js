/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import crypto from 'node:crypto'

export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 1024
export const COOKIE = 'hemlock_admin'
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000
export const LOCKOUT_FAILURES = 5
export const LOCKOUT_MS = 15 * 60 * 1000

const SCRYPT_N = 2 ** 15
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_BYTES = 64
// scrypt needs 128 * N * r bytes; Node's default 32 MiB cap refuses N = 2^15 with r = 8.
const SCRYPT_MAXMEM = 64 * 1024 * 1024

export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, SCRYPT_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM })
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64url'), hash.toString('base64url')].join('$')
}

export function verifyPassword(password, stored) {
  const [kind, n, r, p, salt, hash, ...rest] = String(stored).split('$')
  const [N, R, P] = [n, r, p].map(Number)
  if (kind !== 'scrypt' || rest.length > 0 || !salt || !hash) return false
  if (!Number.isInteger(N) || N < 2 || N > 2 ** 20 || !Number.isInteger(R) || R < 1 || R > 16 || !Number.isInteger(P) || P < 1 || P > 4) return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64url'), expected.length, { N, r: R, p: P, maxmem: 256 * N * R })
  return crypto.timingSafeEqual(actual, expected)
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/
const digest = (token) => crypto.createHash('sha256').update(token).digest('hex')
const iso = (ms) => new Date(ms).toISOString()

// The database keeps only sha256(token) and a fixed expiry from login.
export function createSessions(db, { now = Date.now } = {}) {
  const insert = db.prepare('INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)')
  const find = db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').pluck()
  const removeOne = db.prepare('DELETE FROM sessions WHERE token_hash = ?')
  const removeExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?')

  return {
    create() {
      removeExpired.run(iso(now()))
      const token = crypto.randomBytes(32).toString('base64url')
      insert.run(digest(token), iso(now()), iso(now() + SESSION_MS))
      return token
    },
    valid(token) {
      if (typeof token !== 'string' || !TOKEN.test(token)) return false
      const expires = find.get(digest(token))
      return typeof expires === 'string' && expires > iso(now())
    },
    end(token) {
      if (typeof token === 'string' && TOKEN.test(token)) removeOne.run(digest(token))
    },
  }
}

export const endAllSessions = (db) => db.prepare('DELETE FROM sessions').run().changes

// Failed logins across the whole process: one household, one password.
export function createLockout({ now = Date.now } = {}) {
  let failures = []
  const recent = () => {
    failures = failures.filter((at) => now() - at < LOCKOUT_MS)
    return failures
  }
  return {
    retryAfter() {
      const list = recent()
      return list.length >= LOCKOUT_FAILURES ? Math.ceil((list[0] + LOCKOUT_MS - now()) / 1000) : 0
    },
    fail() {
      recent().push(now())
    },
    clear() {
      failures = []
    },
  }
}

export function readToken(req) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === COOKIE) return value.join('=')
  }
  return null
}

// Path=/api/admin keeps the cookie off every other request; Secure needs TLS, which only the proxy sees.
export function sessionCookie(token, { secure }) {
  const attributes = ['HttpOnly', 'SameSite=Strict', 'Path=/api/admin', `Max-Age=${token ? SESSION_MS / 1000 : 0}`]
  if (secure) attributes.push('Secure')
  return [`${COOKIE}=${token ?? ''}`, ...attributes].join('; ')
}
