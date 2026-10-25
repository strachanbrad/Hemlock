/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import Database from 'better-sqlite3'
import { tempDir } from './support/temp.js'
import { databaseFile, openDb, setPragmas } from '../src/db.js'
import { migrate, schemaVersion } from '../src/migrate.js'

const dirs = []
const scratch = () => {
  const dir = tempDir()
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const tables = (db) => db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").pluck().all()

function migrationsIn(files) {
  const dir = scratch()
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql)
  return dir
}

function connection() {
  const db = new Database(path.join(scratch(), 'test.db'))
  setPragmas(db)
  return db
}

const PARENT_AND_CHILD = `
  CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id) ON DELETE CASCADE);
  INSERT INTO parent VALUES (1, 'a'), (2, 'b');
  INSERT INTO child VALUES (10, 1), (11, 1), (12, 2);
`

describe('openDb', () => {
  it('creates the database in the data directory with the connection pragmas and the schema', () => {
    const dataDir = path.join(scratch(), 'nested', 'data')
    const db = openDb(dataDir)
    try {
      assert.ok(fs.existsSync(databaseFile(dataDir)))
      assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
      assert.equal(db.pragma('journal_mode', { simple: true }), 'wal')
      assert.equal(db.pragma('busy_timeout', { simple: true }), 5000)
      assert.equal(db.pragma('synchronous', { simple: true }), 1)
      assert.deepEqual(tables(db), ['authors', 'books', 'editions', 'schema_migrations'])
      assert.deepEqual(db.prepare('SELECT version, name FROM schema_migrations').all(), [{ version: 1, name: '001_init.sql' }])
    } finally {
      db.close()
    }
  })

  it('applies nothing twice and keeps the data on a second open', () => {
    const dataDir = scratch()
    const first = openDb(dataDir)
    first.prepare("INSERT INTO authors (name) VALUES ('Jane Austen')").run()
    first.close()

    const second = openDb(dataDir)
    try {
      assert.equal(second.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get(), 1)
      assert.equal(second.prepare('SELECT COUNT(*) FROM authors').pluck().get(), 1)
    } finally {
      second.close()
    }
  })

  it('enforces foreign keys on the connection it returns', () => {
    const db = openDb(scratch())
    try {
      assert.throws(
        () => db.prepare("INSERT INTO books (title, author_id) VALUES ('x', 99)").run(),
        { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' },
      )
    } finally {
      db.close()
    }
  })
})

describe('migrate', () => {
  it('applies pending files in order and records each version', () => {
    const db = connection()
    const dir = migrationsIn({
      '002_second.sql': 'ALTER TABLE parent ADD COLUMN note TEXT;',
      '001_first.sql': PARENT_AND_CHILD,
    })
    assert.equal(migrate(db, dir), 2)
    assert.deepEqual(db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all(), [
      { version: 1, name: '001_first.sql' },
      { version: 2, name: '002_second.sql' },
    ])
    assert.equal(schemaVersion(db), 2)
    db.close()
  })

  it('rebuilds a parent table without cascading into its child rows', () => {
    const db = connection()
    const dir = migrationsIn({
      '001_first.sql': PARENT_AND_CHILD,
      '002_rebuild.sql': `
        CREATE TABLE parent_new (id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE);
        INSERT INTO parent_new SELECT id, name FROM parent;
        DROP TABLE parent;
        ALTER TABLE parent_new RENAME TO parent;
      `,
    })
    migrate(db, dir)
    assert.equal(db.prepare('SELECT COUNT(*) FROM child').pluck().get(), 3)
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
    db.close()
  })

  it('rolls a migration back when it leaves a foreign key violation', () => {
    const db = connection()
    const dir = migrationsIn({
      '001_first.sql': PARENT_AND_CHILD,
      '002_orphan.sql': 'CREATE TABLE extra (id INTEGER PRIMARY KEY); DELETE FROM parent WHERE id = 2;',
    })
    assert.throws(() => migrate(db, dir), /002_orphan\.sql leaves 1 foreign key violations/)
    assert.equal(schemaVersion(db), 1)
    assert.ok(!tables(db).includes('extra'))
    assert.equal(db.prepare('SELECT COUNT(*) FROM parent').pluck().get(), 2)
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
    db.close()
  })

  it('rolls a failing migration back and keeps the earlier ones', () => {
    const db = connection()
    const dir = migrationsIn({
      '001_first.sql': PARENT_AND_CHILD,
      '002_broken.sql': 'CREATE TABLE half (id INTEGER PRIMARY KEY); INSERT INTO nowhere VALUES (1);',
    })
    assert.throws(() => migrate(db, dir), /no such table: nowhere/)
    assert.equal(schemaVersion(db), 1)
    assert.ok(!tables(db).includes('half'))
    db.close()
  })

  it('refuses a migration that contains a PRAGMA', () => {
    const db = connection()
    const dir = migrationsIn({ '001_pragma.sql': 'CREATE TABLE t (id INTEGER);\npragma foreign_keys = OFF;' })
    assert.throws(() => migrate(db, dir), /001_pragma\.sql contains a PRAGMA/)
    assert.equal(schemaVersion(db), 0)
    db.close()
  })

  it('refuses misnamed and duplicate versions', () => {
    const db = connection()
    assert.throws(() => migrate(db, migrationsIn({ '1_short.sql': '' })), /not named NNN_short_description\.sql/)
    assert.throws(() => migrate(db, migrationsIn({ '001_a.sql': '', '001_b.sql': '' })), /share the version 001/)
    db.close()
  })

  it('refuses a database whose schema is newer than the checkout, and changes nothing', () => {
    const db = connection()
    migrate(db, migrationsIn({ '001_first.sql': PARENT_AND_CHILD, '002_second.sql': 'ALTER TABLE parent ADD COLUMN note TEXT;' }))
    const older = migrationsIn({ '001_first.sql': PARENT_AND_CHILD, '000_before.sql': 'CREATE TABLE never (id INTEGER);' })
    assert.throws(
      () => migrate(db, older),
      { message: "Database is at schema 2, newer than this checkout's migrations (1); restore a backup (wiki/deployment.md#restore)" },
    )
    assert.ok(!tables(db).includes('never'), 'nothing is applied')
    assert.equal(schemaVersion(db), 2)
    db.close()
  })
})
