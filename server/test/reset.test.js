/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { tempDir } from './support/temp.js'
import { defaultDataDir } from '../src/config.js'
import { openDb } from '../src/db.js'
import { resetDatabase, resetRefusal } from '../src/reset.js'

const dataDir = tempDir()
after(() => fs.rmSync(dataDir, { recursive: true, force: true }))

describe('resetRefusal', () => {
  it('refuses production, even with --force', () => {
    assert.match(resetRefusal({ production: true, dataDir: defaultDataDir }), /NODE_ENV=production/)
    assert.match(resetRefusal({ production: true, dataDir: defaultDataDir }, { force: true }), /NODE_ENV=production/)
  })

  it('refuses a data directory other than the checkout one unless forced', () => {
    assert.match(resetRefusal({ production: false, dataDir: '/var/lib/hemlock' }), /pass --force/)
    assert.equal(resetRefusal({ production: false, dataDir: '/var/lib/hemlock' }, { force: true }), null)
    assert.equal(resetRefusal({ production: false, dataDir: defaultDataDir }), null)
  })
})

describe('resetDatabase', () => {
  it('loads the seed library and its covers, in place under an open connection', () => {
    const running = openDb(dataDir)
    running.exec("INSERT INTO Authors (first_name, last_name) VALUES ('Left', 'Over')")
    fs.mkdirSync(path.join(dataDir, 'covers'), { recursive: true })
    fs.writeFileSync(path.join(dataDir, 'covers', '9999999999999.jpg'), 'stale')

    const first = resetDatabase(dataDir)
    assert.deepEqual(first, { schema: 1, authors: 12, books: 10, ebooks: 10, covers: 10 })
    assert.equal(running.prepare("SELECT COUNT(*) FROM Authors WHERE last_name = 'Over'").pluck().get(), 0)
    assert.equal(running.prepare('SELECT COUNT(*) FROM Books').pluck().get(), 10)
    assert.ok(!fs.existsSync(path.join(dataDir, 'covers', '9999999999999.jpg')))
    running.close()

    assert.deepEqual(resetDatabase(dataDir), first)
  })
})
