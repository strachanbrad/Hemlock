/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import crypto from 'node:crypto'
import { isToken, newToken, tokenDigest } from './auth.js'
import { httpError } from './errors.js'
import { validName } from './users.js'

export const PAIRING_MS = 10 * 60 * 1000
export const MAX_PENDING = 20
export const PAIRINGS_PER_MINUTE = 3
export const WAITING = Symbol('waiting')
const MINUTE = 60 * 1000
const SEEN_MS = 60 * 60 * 1000

const iso = (ms) => new Date(ms).toISOString()

function pairingCode(value) {
  const code = typeof value === 'string' ? value.replace(/\s/g, '') : ''
  if (!/^\d{6}$/.test(code)) throw httpError(400, 'code must be six digits')
  return code
}

// Pending pairings live in memory only: a restart forgets them, and the TV asks for a new code.
// A pairing's token is held until its one poll answer, and the database keeps only sha256(token).
export function createDevices(db, { now = Date.now } = {}) {
  const insert = db.prepare('INSERT INTO devices (name, token_hash, created_at) VALUES (?, ?, ?)')
  const all = db.prepare('SELECT id, name, created_at, last_seen_at FROM devices ORDER BY created_at, id')
  const byHash = db.prepare('SELECT id, name, last_seen_at FROM devices WHERE token_hash = ?')
  const stampSeen = db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?')
  const removeOne = db.prepare('DELETE FROM devices WHERE id = ?')
  const pending = new Map()
  const starts = new Map()

  const prune = () => {
    for (const [poll, pairing] of pending) if (pairing.expires <= now()) pending.delete(poll)
    for (const [address, times] of starts) {
      const recent = times.filter((at) => now() - at < MINUTE)
      if (recent.length > 0) starts.set(address, recent)
      else starts.delete(address)
    }
  }
  const codeInUse = (code) => [...pending.values()].some((pairing) => pairing.code === code)

  return {
    // Answers { code, poll }, or { refused: 429 | 503, retryAfter } in seconds.
    pair(address) {
      prune()
      const recent = starts.get(address) ?? []
      if (recent.length >= PAIRINGS_PER_MINUTE) return { refused: 429, retryAfter: Math.ceil((recent[0] + MINUTE - now()) / 1000) }
      if (pending.size >= MAX_PENDING) {
        const soonest = Math.min(...[...pending.values()].map((pairing) => pairing.expires))
        return { refused: 503, retryAfter: Math.ceil((soonest - now()) / 1000) }
      }
      let code
      do {
        code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
      } while (codeInUse(code))
      let poll
      do {
        poll = crypto.randomBytes(24).toString('base64url')
      } while (pending.has(poll))
      pending.set(poll, { code, expires: now() + PAIRING_MS, token: null })
      starts.set(address, [...recent, now()])
      return { code, poll }
    },
    // The token once the pairing is approved (then the pairing is gone), WAITING before, null when unknown or expired.
    collect(poll) {
      prune()
      const pairing = typeof poll === 'string' ? pending.get(poll) : undefined
      if (!pairing) return null
      if (!pairing.token) return WAITING
      pending.delete(poll)
      return pairing.token
    },
    approve(code, name) {
      const wanted = pairingCode(code)
      const valid = validName(name)
      prune()
      const pairing = [...pending.values()].find((candidate) => candidate.code === wanted && !candidate.token)
      if (!pairing) throw httpError(404, 'No television is showing that code')
      const token = newToken()
      const at = iso(now())
      const { lastInsertRowid } = insert.run(valid, tokenDigest(token), at)
      pairing.token = token
      return { id: Number(lastInsertRowid), name: valid, created_at: at }
    },
    // The paired device for a token, stamping last_seen_at at most once an hour; null for anything else.
    device(token) {
      if (!isToken(token)) return null
      const row = byHash.get(tokenDigest(token))
      if (!row) return null
      if (!row.last_seen_at || Date.parse(row.last_seen_at) + SEEN_MS <= now()) stampSeen.run(iso(now()), row.id)
      return { id: row.id, name: row.name }
    },
    list: () => all.all(),
    remove(id) {
      if (removeOne.run(id).changes === 0) throw httpError(404, 'Television not found')
    },
  }
}
