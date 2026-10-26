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
import { migrate, migrationsDir, schemaVersion } from '../src/migrate.js'

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
      assert.deepEqual(tables(db), ['authors', 'books', 'devices', 'editions', 'schema_migrations', 'sessions', 'settings', 'user_sessions', 'users'])
      assert.deepEqual(db.prepare('SELECT version, name FROM schema_migrations').all(), [{ version: 1, name: '001_init.sql' }, { version: 2, name: '002_settings.sql' }, { version: 3, name: '003_users.sql' }])
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
      assert.equal(second.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get(), 3)
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

describe('003_users.sql', () => {
  const shipped = (name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8')
  const OLD_TABLES = ['authors', 'books', 'editions', 'settings', 'sessions']
  const rows = (db) => Object.fromEntries(OLD_TABLES.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]))

  it('adds users, their sessions and the televisions to a schema 2 library, keeping every row', () => {
    const db = connection()
    assert.equal(migrate(db, migrationsIn({ '001_init.sql': shipped('001_init.sql'), '002_settings.sql': shipped('002_settings.sql') })), 2)
    db.exec(`
      INSERT INTO authors (id, name) VALUES (1, 'Jane Austen'), (2, 'Emily Brontë');
      INSERT INTO books (id, title, author_id, star_rating, read, cover) VALUES (1, 'Emma', 1, 4, 1, 'b1-0123abcd.jpg'), (2, 'Wuthering Heights', 2, 5, 0, NULL);
      INSERT INTO editions (id, book_id, format, isbn) VALUES (1, 1, 'paperback', '9780141439587'), (2, 2, 'ebook', NULL);
      INSERT INTO settings VALUES ('anthropic_model', 'claude-opus-5-5', 0, '2026-10-01T00:00:00.000Z'), ('admin_password_hash', 'v1:a:b:c', 1, '2026-10-01T00:00:00.000Z');
      INSERT INTO sessions VALUES ('${'a'.repeat(64)}', '2026-10-01T00:00:00.000Z', '2026-10-31T00:00:00.000Z');
    `)
    const before = rows(db)

    assert.equal(migrate(db), 3)
    assert.deepEqual(rows(db), before)
    assert.deepEqual(db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all().map(({ name }) => name), ['001_init.sql', '002_settings.sql', '003_users.sql'])
    const added = db.pragma('table_list').filter(({ name }) => ['users', 'user_sessions', 'devices'].includes(name))
    assert.deepEqual(added.map(({ name, strict }) => [name, strict]).sort(), [['devices', 1], ['user_sessions', 1], ['users', 1]])
    for (const { name } of added) assert.equal(db.prepare(`SELECT COUNT(*) FROM ${name}`).pluck().get(), 0, name)
    db.close()
  })

  it('keeps names unique in any ASCII case, refuses a value of the wrong type and cascades a user to their sessions', () => {
    const db = connection()
    migrate(db)
    const at = '2026-10-25T00:00:00.000Z'
    const user = db.prepare('INSERT INTO users (name, password_hash, created_at) VALUES (?, ?, ?)')
    const { lastInsertRowid: ana } = user.run('Ana', 'scrypt$x', at)
    assert.throws(() => user.run('ANA', 'scrypt$y', at), { code: 'SQLITE_CONSTRAINT_UNIQUE' })
    const session = db.prepare('INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    session.run('a'.repeat(64), ana, at, at)
    assert.throws(() => session.run('b'.repeat(64), 'Ana', at, at), { code: 'SQLITE_CONSTRAINT_DATATYPE' })
    assert.throws(() => session.run('c'.repeat(64), 99, at, at), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })
    const device = db.prepare('INSERT INTO devices (name, token_hash, created_at) VALUES (?, ?, ?)')
    device.run('Living room', 'd'.repeat(64), at)
    assert.throws(() => device.run('Kitchen', 'd'.repeat(64), at), { code: 'SQLITE_CONSTRAINT_UNIQUE' })
    db.prepare('DELETE FROM users WHERE id = ?').run(ana)
    assert.equal(db.prepare('SELECT COUNT(*) FROM user_sessions').pluck().get(), 0)
    db.close()
  })
})
