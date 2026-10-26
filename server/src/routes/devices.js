/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Router } from 'express'
import { WAITING } from '../devices.js'

const REFUSED = {
  429: 'Too many pairing codes from this address; try again in a minute',
  503: 'Too many televisions are pairing; try again later',
}

// Open to anyone: a code is worth nothing until it is typed on the admin page.
export default function deviceRoutes(devices) {
  const router = Router()

  router.post('/devices/pair', (req, res) => {
    res.set('Cache-Control', 'no-store')
    const answer = devices.pair(req.ip)
    if (answer.refused) {
      res.set('Retry-After', String(answer.retryAfter))
      return res.status(answer.refused).json({ error: REFUSED[answer.refused] })
    }
    res.json(answer)
  })

  router.get('/devices/pair/:poll', (req, res) => {
    res.set('Cache-Control', 'no-store')
    const answer = devices.collect(req.params.poll)
    if (answer === null) return res.status(410).json({ error: 'This code has expired; ask for a new one' })
    if (answer === WAITING) return res.status(204).end()
    res.json({ token: answer })
  })

  return router
}
