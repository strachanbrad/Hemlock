/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Router } from 'express'
import { httpError } from '../errors.js'
import { toIsbn13 } from '../lib/isbn.js'

function isbnOf(req) {
  const isbn = toIsbn13(req.params.isbn)
  if (!isbn) throw httpError(400, 'Not a valid ISBN-10 or ISBN-13')
  return isbn
}

export default function lookupRoutes(lookup, identify) {
  const router = Router()

  router.get('/lookup/:isbn', async (req, res) => {
    const { status, body } = await lookup(isbnOf(req))
    res.status(status).json(body)
  })

  router.post('/lookup/:isbn/identify', async (req, res) => {
    const { status, body } = await identify(isbnOf(req))
    res.status(status).json(body)
  })

  return router
}
