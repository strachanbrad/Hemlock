/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import crypto from 'node:crypto'
import { MAX_PASSWORD, MIN_PASSWORD, USER_SESSION_MS, hashPassword, isToken, newToken, tokenDigest, verifyPassword } from './auth.js'
import { httpError } from './errors.js'

export const MAX_NAME = 64
const RENEW_MS = 24 * 60 * 60 * 1000
const CONTROL = /\p{Cc}/u

const iso = (ms) => new Date(ms).toISOString()

export function validName(value) {
  if (typeof value !== 'string') throw httpError(400, 'name must be a string')
  const name = value.trim()
  if (name === '') throw httpError(400, 'name must not be empty')
  if ([...name].length > MAX_NAME) throw httpError(400, `name is longer than ${MAX_NAME} characters`)
  if (CONTROL.test(name)) throw httpError(400, 'name must not contain control characters')
  return name
}

export function validPassword(value) {
  if (typeof value !== 'string') throw httpError(400, 'password must be a string')
  if ([...value].length < MIN_PASSWORD) throw httpError(400, `password needs at least ${MIN_PASSWORD} characters`)
  if (value.length > MAX_PASSWORD) throw httpError(400, `password is longer than ${MAX_PASSWORD} characters`)
  return value
}

// The database keeps only sha256(token). A session lasts 180 days from its last renewal, and a hit
// renews it at most once a day.
export function createUsers(db, { now = Date.now } = {}) {
  const insert = db.prepare('INSERT INTO users (name, password_hash, created_at) VALUES (?, ?, ?)')
  const byName = db.prepare('SELECT id, name, password_hash FROM users WHERE name = ?')
  const all = db.prepare('SELECT id, name, created_at, last_login_at FROM users ORDER BY name COLLATE NOCASE, id')
  const any = db.prepare('SELECT EXISTS (SELECT 1 FROM users)').pluck()
  const updateHash = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
  const removeUser = db.prepare('DELETE FROM users WHERE id = ?')
  const stampLogin = db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
  const openSession = db.prepare('INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
  const findSession = db.prepare('SELECT u.id, u.name, s.expires_at FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
  const renewSession = db.prepare('UPDATE user_sessions SET expires_at = ? WHERE token_hash = ?')
  const closeSession = db.prepare('DELETE FROM user_sessions WHERE token_hash = ?')
  const closeAll = db.prepare('DELETE FROM user_sessions WHERE user_id = ?')
  const removeExpired = db.prepare('DELETE FROM user_sessions WHERE expires_at <= ?')
  // An unknown name still costs one scrypt, so the answer's timing does not tell which names exist.
  let decoy = null

  return {
    add(name, password) {
      const valid = validName(name)
      const hash = hashPassword(validPassword(password))
      const at = iso(now())
      try {
        const { lastInsertRowid } = insert.run(valid, hash, at)
        return { id: Number(lastInsertRowid), name: valid, created_at: at, last_login_at: null }
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw httpError(409, `The name ${valid} is taken`)
        throw err
      }
    },
    setPassword(id, password) {
      const hash = hashPassword(validPassword(password))
      db.transaction(() => {
        if (updateHash.run(hash, id).changes === 0) throw httpError(404, 'User not found')
        closeAll.run(id)
      })()
    },
    // ON DELETE CASCADE ends the user's sessions with them.
    remove(id) {
      if (removeUser.run(id).changes === 0) throw httpError(404, 'User not found')
    },
    list: () => all.all(),
    exist: () => any.get() === 1,
    verify(name, password) {
      const row = typeof name === 'string' ? byName.get(name.trim()) : undefined
      decoy ??= hashPassword(crypto.randomBytes(16).toString('hex'))
      const right = verifyPassword(password, row?.password_hash ?? decoy)
      return row && right ? { id: row.id, name: row.name } : null
    },
    open(userId) {
      const token = newToken()
      const at = now()
      db.transaction(() => {
        removeExpired.run(iso(at))
        openSession.run(tokenDigest(token), userId, iso(at), iso(at + USER_SESSION_MS))
        stampLogin.run(iso(at), userId)
      })()
      return token
    },
    // renewed says the expiry moved, so the caller sends the cookie again with a fresh Max-Age.
    user(token) {
      if (!isToken(token)) return null
      const hash = tokenDigest(token)
      const row = findSession.get(hash)
      const at = now()
      if (!row || row.expires_at <= iso(at)) return null
      const renewed = Date.parse(row.expires_at) - USER_SESSION_MS + RENEW_MS <= at
      if (renewed) renewSession.run(iso(at + USER_SESSION_MS), hash)
      return { id: row.id, name: row.name, renewed }
    },
    close(token) {
      if (isToken(token)) closeSession.run(tokenDigest(token))
    },
  }
}
