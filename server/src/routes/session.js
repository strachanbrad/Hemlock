/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Router } from 'express'
import { MAX_PASSWORD, USER_COOKIE, createLockout, readCookie, userCookie } from '../auth.js'
import { httpError } from '../errors.js'

const MAX_LOGIN_NAME = 256

// Paths under /api that answer without a session; /admin has its own gate in routes/admin.js.
function open({ method, path }) {
  if (path === '/admin' || path.startsWith('/admin/')) return true
  if (method === 'GET') return path === '/health' || path.startsWith('/devices/pair/')
  if (method === 'POST') return path === '/login' || path === '/logout' || path === '/devices/pair'
  return false
}

const bearer = (req) => /^Bearer +(\S+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? null

// CRITICAL: mounted on /api ahead of every router, so a route added later is guarded by default.
export function signInGuard({ users, devices, secure }) {
  return (req, res, next) => {
    if (open(req)) return next()
    const token = readCookie(req, USER_COOKIE)
    const user = users.user(token)
    if (user) {
      if (user.renewed) res.set('Set-Cookie', userCookie(token, { secure }))
      req.user = { id: user.id, name: user.name }
      return next()
    }
    const device = devices.device(bearer(req))
    if (device) {
      req.device = device
      return next()
    }
    res.status(401).json({ error: 'Sign in' })
  }
}

// The lockout counts per name and per client address. Behind nginx every request comes from
// 127.0.0.1, so the address count is one count for the whole process there.
export default function sessionRoutes({ users, secure, now = Date.now }) {
  const router = Router()
  const lockout = createLockout({ now })

  router.post('/login', (req, res) => {
    const { name, password } = req.body ?? {}
    if (typeof name !== 'string' || name.trim() === '' || name.length > MAX_LOGIN_NAME) throw httpError(400, 'Enter your name')
    if (typeof password !== 'string' || password === '' || password.length > MAX_PASSWORD) throw httpError(400, 'Enter the password')
    if (!users.exist()) return res.status(503).json({ error: 'No user exists yet; run npm run user:add on the server' })
    const keys = [`name:${name.trim().toLowerCase()}`, `address:${req.ip}`]
    const wait = Math.max(...keys.map((key) => lockout.retryAfter(key)))
    if (wait > 0) {
      res.set('Retry-After', String(wait))
      return res.status(429).json({ error: `Too many wrong passwords; try again in ${Math.ceil(wait / 60)} minutes` })
    }
    const user = users.verify(name, password)
    if (!user) {
      for (const key of keys) lockout.fail(key)
      return res.status(401).json({ error: 'Wrong name or password' })
    }
    for (const key of keys) lockout.clear(key)
    users.close(readCookie(req, USER_COOKIE))
    res.set('Set-Cookie', userCookie(users.open(user.id), { secure }))
    res.json({ name: user.name })
  })

  router.post('/logout', (req, res) => {
    users.close(readCookie(req, USER_COOKIE))
    res.set('Set-Cookie', userCookie(null, { secure }))
    res.status(204).end()
  })

  // A paired TV passes the guard but is not a user.
  router.get('/session', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in' })
    res.json({ name: req.user.name })
  })

  return router
}
