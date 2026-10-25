/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { dataDir, loadApp } from './support/server.js'
import { isValidIsbn13 } from '../src/lib/isbn.js'

let db
let imageType
const seedCovers = path.join(import.meta.dirname, '../seed/covers')
before(async () => {
  const app = await loadApp()
  imageType = app.imageType
  const { resetDatabase } = await import('../src/reset.js')
  resetDatabase(dataDir)
  db = app.openDb(dataDir)
})
after(() => {
  db.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('the seed library', () => {
  it('stores only valid ISBN-13s', () => {
    for (const isbn of db.prepare('SELECT isbn FROM editions WHERE isbn IS NOT NULL').pluck().all()) {
      assert.ok(isValidIsbn13(isbn), isbn)
    }
  })

  it('names every cover file in server/seed/covers exactly once, with the extension its bytes show', () => {
    const named = db.prepare('SELECT cover FROM editions WHERE cover IS NOT NULL UNION ALL SELECT cover FROM books WHERE cover IS NOT NULL').pluck().all()
    assert.deepEqual([...named].sort(), fs.readdirSync(seedCovers).sort())
    for (const name of named) {
      assert.equal(imageType(fs.readFileSync(path.join(seedCovers, name))), path.extname(name).slice(1), name)
    }
  })

  it('holds the cases the model needs: two formats of one book, a book not owned, a wishlisted ebook', () => {
    const count = (sql) => db.prepare(sql).pluck().get()
    assert.ok(count("SELECT COUNT(*) FROM books b WHERE EXISTS (SELECT 1 FROM editions WHERE book_id = b.id AND format = 'ebook') AND EXISTS (SELECT 1 FROM editions WHERE book_id = b.id AND format <> 'ebook')") > 0)
    assert.ok(count('SELECT COUNT(*) FROM books b WHERE wishlist = 1 AND NOT EXISTS (SELECT 1 FROM editions WHERE book_id = b.id)') > 0)
    assert.ok(count("SELECT COUNT(*) FROM books b WHERE wishlist = 1 AND EXISTS (SELECT 1 FROM editions WHERE book_id = b.id AND format = 'ebook')") > 0)
    assert.equal(count("SELECT COUNT(*) FROM editions WHERE format = 'ebook' AND isbn IS NOT NULL"), 0)
  })
})
