/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import path from 'node:path'

export const migrationsDir = path.resolve(import.meta.dirname, '../migrations')

const FILE_NAME = /^(\d{3})_[a-z0-9_]+\.sql$/

export function migrationFiles(dir = migrationsDir) {
  const versions = new Set()
  return fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort().map((name) => {
    const match = FILE_NAME.exec(name)
    if (!match) throw new Error(`Migration ${name} is not named NNN_short_description.sql`)
    const version = Number(match[1])
    if (versions.has(version)) throw new Error(`Two migrations share the version ${match[1]}`)
    versions.add(version)
    return { version, name, file: path.join(dir, name) }
  })
}

export function schemaVersion(db) {
  return db.prepare('SELECT MAX(version) FROM schema_migrations').pluck().get() ?? 0
}

export function migrate(db, dir = migrationsDir) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`)
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').pluck().all())
  const record = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
  const files = migrationFiles(dir)

  const recorded = schemaVersion(db)
  const latest = files.at(-1)?.version ?? 0
  if (recorded > latest) {
    throw new Error(`Database is at schema ${recorded}, newer than this checkout's migrations (${latest}); restore a backup (wiki/deployment.md#restore)`)
  }

  for (const { version, name, file } of files) {
    if (applied.has(version)) continue
    const sql = fs.readFileSync(file, 'utf8')
    if (/^\s*PRAGMA\b/im.test(sql)) throw new Error(`Migration ${name} contains a PRAGMA`)

    // CRITICAL: foreign_keys only changes outside a transaction, and while it is on,
    // dropping a rebuilt parent table cascades into every child row.
    db.pragma('foreign_keys = OFF')
    try {
      db.exec('BEGIN')
      try {
        db.exec(sql)
        const violations = db.pragma('foreign_key_check')
        if (violations.length > 0) {
          throw new Error(`Migration ${name} leaves ${violations.length} foreign key violations (first in ${violations[0].table})`)
        }
        record.run(version, name, new Date().toISOString())
        db.exec('COMMIT')
      } catch (err) {
        if (db.inTransaction) db.exec('ROLLBACK')
        throw err
      }
    } finally {
      db.pragma('foreign_keys = ON')
    }
  }

  return schemaVersion(db)
}
