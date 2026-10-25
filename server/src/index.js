/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import { createApp } from './app.js'
import { config } from './config.js'
import { coversDir } from './covers.js'
import { openDb } from './db.js'
import { schemaVersion } from './migrate.js'

const db = openDb()
fs.mkdirSync(coversDir, { recursive: true })

// Express 5 hands a listen error (EADDRINUSE) to this callback instead of throwing.
const server = createApp({ db }).listen(config.port, config.host, (err) => {
  if (err) {
    console.error(`Cannot listen on ${config.host}:${config.port}: ${err.message}`)
    db.close()
    process.exit(1)
  }
  console.log(`Hemlock ${config.version} (schema ${schemaVersion(db)}) on http://${config.host}:${config.port}, data in ${config.dataDir}`)
})

const shutdown = () => {
  server.close()
  db.close()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
