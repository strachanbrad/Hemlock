/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config } from './config.js'
import { migrate } from './migrate.js'

export const databaseFile = (dataDir) => path.join(dataDir, 'hemlock.db')

// The pragmas are per connection and set before migrate: inside a migration's
// transaction foreign_keys is a silent no-op and journal_mode = WAL is an error.
export function setPragmas(db) {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
  if (db.pragma('foreign_keys', { simple: true }) !== 1) throw new Error('SQLite did not turn foreign_keys on')
}

export function openDb(dataDir = config.dataDir) {
  fs.mkdirSync(dataDir, { recursive: true })
  const db = new Database(databaseFile(dataDir))
  try {
    setPragmas(db)
    migrate(db)
  } catch (err) {
    db.close()
    throw err
  }
  return db
}
