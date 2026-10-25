/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Router } from 'express'

export default function authorRoutes(db) {
  const router = Router()

  router.get('/authors', (req, res) => {
    res.json({ message: 'Authors retrieved successfully', data: db.prepare('SELECT * FROM Authors').all() })
  })

  return router
}
