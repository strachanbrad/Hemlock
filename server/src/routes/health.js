/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Router } from 'express'
import { config } from '../config.js'
import { schemaVersion } from '../migrate.js'

export default function healthRoutes(db) {
  const router = Router()

  router.get('/health', (req, res) => {
    res.json({ ok: true, version: config.version, schema: schemaVersion(db) })
  })

  return router
}
