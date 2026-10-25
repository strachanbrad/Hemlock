/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { defaultDataDir } from './config.js'
import { databaseFile, openDb } from './db.js'
import { schemaVersion } from './migrate.js'

export const seedDir = path.resolve(import.meta.dirname, '../seed')

export function resetRefusal({ production, dataDir }, { force = false } = {}) {
  if (production) return 'db:reset never runs with NODE_ENV=production.'
  if (path.resolve(dataDir) !== defaultDataDir && !force) {
    return `DATA_DIR is ${dataDir}, not ${defaultDataDir}; pass --force to reset it.`
  }
  return null
}

// Empties the database in place rather than unlinking it, so a running dev server
// sees the reset library instead of keeping the deleted file open.
function dropEverything(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true })
  const db = new Database(databaseFile(dataDir))
  try {
    db.pragma('busy_timeout = 5000')
    db.pragma('foreign_keys = OFF')
    const objects = db.prepare("SELECT type, name FROM sqlite_schema WHERE type IN ('view', 'trigger', 'table') AND name NOT LIKE 'sqlite_%'").all()
    db.transaction(() => {
      for (const { type, name } of objects) db.exec(`DROP ${type.toUpperCase()} IF EXISTS "${name.replaceAll('"', '""')}"`)
    })()
  } finally {
    db.close()
  }
}

export function resetDatabase(dataDir) {
  dropEverything(dataDir)
  const covers = path.join(dataDir, 'covers')
  fs.rmSync(covers, { recursive: true, force: true })
  fs.cpSync(path.join(seedDir, 'covers'), covers, { recursive: true })

  const db = openDb(dataDir)
  try {
    db.transaction(() => db.exec(fs.readFileSync(path.join(seedDir, 'seed.sql'), 'utf8')))()
    const count = (table) => db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()
    return {
      schema: schemaVersion(db),
      authors: count('authors'),
      books: count('books'),
      editions: count('editions'),
      covers: fs.readdirSync(covers).length,
    }
  } finally {
    db.close()
  }
}
