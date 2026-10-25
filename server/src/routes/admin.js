/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Router } from 'express'
import { MAX_PASSWORD, createLockout, readToken, sessionCookie, verifyPassword } from '../auth.js'
import { isContact } from '../config.js'
import { httpError } from '../errors.js'

export const ADMIN_SETTINGS = ['google_books_api_key', 'anthropic_api_key', 'anthropic_model', 'lookup_contact']
const MAX_SETTING = 256
const KEY_OF = { google: 'google_books_api_key', anthropic: 'anthropic_api_key' }
const NOT_SET = { google: 'No Google Books key is set', anthropic: 'No Claude key is set' }

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// Returns [name, value | null] pairs: a string sets, null clears; an absent key or an empty string is left out.
export function settingChanges(body) {
  if (!isObject(body)) throw httpError(400, 'The settings must be a JSON object')
  const unknown = Object.keys(body).filter((name) => !ADMIN_SETTINGS.includes(name))
  if (unknown.length > 0) throw httpError(400, `Unknown setting: ${unknown.join(', ')}`)
  const changes = []
  for (const name of ADMIN_SETTINGS) {
    const value = body[name]
    if (value === undefined) continue
    if (value === null) {
      changes.push([name, null])
      continue
    }
    if (typeof value !== 'string') throw httpError(400, `${name} must be a string or null`)
    const text = value.trim()
    if (text === '') continue
    if (/\s/.test(text)) throw httpError(400, `${name} must not contain spaces`)
    if (text.length > MAX_SETTING) throw httpError(400, `${name} is longer than ${MAX_SETTING} characters`)
    if (name === 'anthropic_model' && !/^[a-z0-9.-]+$/.test(text)) throw httpError(400, 'anthropic_model may hold only lowercase letters, digits, dots and hyphens')
    if (name === 'lookup_contact' && !isContact(text)) throw httpError(400, 'lookup_contact is not an email address')
    changes.push([name, text])
  }
  return changes
}

const redact = (text, key) => (key ? String(text).split(key).join('[redacted]') : String(text))

// probes.google(key) and probes.anthropic(key) resolve to { ok: true, detail } or { ok: false, error }.
export default function adminRoutes({ db, settings, sessions, probes, secure, now = Date.now }) {
  const router = Router()
  const lockout = createLockout({ now })
  const statuses = () => Object.fromEntries(ADMIN_SETTINGS.map((name) => [name, settings.status(name)]))

  router.post('/admin/login', (req, res) => {
    const password = req.body?.password
    if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD) throw httpError(400, 'Enter the password')
    const stored = settings.get('admin_password_hash')
    if (!stored) {
      return res.status(503).json({ error: 'No admin password is set; run npm run admin:password on the server' })
    }
    const wait = lockout.retryAfter()
    if (wait > 0) {
      res.set('Retry-After', String(wait))
      return res.status(429).json({ error: `Too many wrong passwords; try again in ${Math.ceil(wait / 60)} minutes` })
    }
    if (!verifyPassword(password, stored)) {
      lockout.fail()
      return res.status(401).json({ error: 'Wrong password' })
    }
    lockout.clear()
    res.set('Set-Cookie', sessionCookie(sessions.create(), { secure }))
    res.status(204).end()
  })

  router.post('/admin/logout', (req, res) => {
    sessions.end(readToken(req))
    res.set('Set-Cookie', sessionCookie(null, { secure }))
    res.status(204).end()
  })

  // CRITICAL: every route below this guard, and any unknown /api/admin path, needs a session.
  router.use('/admin', (req, res, next) => {
    if (!sessions.valid(readToken(req))) return res.status(401).json({ error: 'Not signed in' })
    next()
  })

  router.get('/admin/session', (req, res) => res.json({ admin: true }))

  router.get('/admin/settings', (req, res) => res.json(statuses()))

  router.put('/admin/settings', (req, res) => {
    const changes = settingChanges(req.body)
    db.transaction(() => {
      for (const [name, value] of changes) {
        if (value === null) settings.clear(name)
        else settings.set(name, value)
      }
    })()
    res.json(statuses())
  })

  router.post('/admin/settings/test', async (req, res) => {
    const service = req.body?.service
    if (!Object.hasOwn(KEY_OF, service)) throw httpError(400, "service must be 'google' or 'anthropic'")
    const key = settings.get(KEY_OF[service])
    if (!key) return res.status(503).json({ error: NOT_SET[service] })
    const started = now()
    let result
    try {
      result = await probes[service](key)
    } catch (err) {
      result = { ok: false, error: err.message }
    }
    if (!result.ok) return res.status(502).json({ error: redact(result.error, key) })
    res.json({ ok: true, latency_ms: Math.round(now() - started), detail: redact(result.detail, key) })
  })

  return router
}
