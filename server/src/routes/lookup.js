/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Router } from 'express'
import { httpError } from '../errors.js'
import { toIsbn13 } from '../lib/isbn.js'

export default function lookupRoutes(lookup) {
  const router = Router()

  router.get('/lookup/:isbn', async (req, res) => {
    const isbn = toIsbn13(req.params.isbn)
    if (!isbn) throw httpError(400, 'Not a valid ISBN-10 or ISBN-13')
    const { status, body } = await lookup(isbn)
    res.status(status).json(body)
  })

  return router
}
