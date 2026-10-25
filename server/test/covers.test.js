/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { JPEG, PNG, WEBP, dataDir, loadApp } from './support/server.js'

let covers
before(async () => {
  covers = await loadApp()
})
after(() => fs.rmSync(dataDir, { recursive: true, force: true }))

describe('covers', () => {
  it('tells the image type from the magic bytes', () => {
    assert.equal(covers.imageType(JPEG), 'jpg')
    assert.equal(covers.imageType(PNG), 'png')
    assert.equal(covers.imageType(WEBP), 'webp')
    assert.equal(covers.imageType(Buffer.from('GIF89a')), null)
    assert.equal(covers.imageType(Buffer.alloc(0)), null)
  })

  it('saves an upload under the data directory and replaces it in place', () => {
    assert.equal(covers.saveCoverFromUpload({ buffer: JPEG }, '9780553212587'), '9780553212587.jpg')
    assert.equal(covers.saveCoverFromUpload({ buffer: PNG }, '9780553212587'), '9780553212587.jpg')
    assert.equal(covers.coversDir, path.join(dataDir, 'covers'))
    assert.deepEqual(fs.readdirSync(covers.coversDir), ['9780553212587.jpg'])
    assert.ok(fs.readFileSync(path.join(covers.coversDir, '9780553212587.jpg')).equals(PNG))
  })

  it('refuses an upload named by anything but an ISBN', () => {
    for (const isbn of ['../9780553212587', '9780553212587.png', '', '978055321258/']) {
      assert.throws(() => covers.saveCoverFromUpload({ buffer: JPEG }, isbn), { status: 400 }, isbn)
    }
  })

  it('deletes only server-generated names and ignores a missing file', () => {
    covers.saveCoverFromUpload({ buffer: JPEG }, '9780156029438')
    covers.deleteCover('9780156029438.jpg')
    assert.ok(!fs.existsSync(path.join(covers.coversDir, '9780156029438.jpg')))
    covers.deleteCover('9780156029438.jpg')
    covers.deleteCover('e12-0123abcd.webp')
    for (const name of ['../hemlock.db', 'hemlock.db', '.9780156029438.jpg.tmp', '9780156029438.gif', 'e12-XYZ.jpg']) {
      assert.throws(() => covers.deleteCover(name), /Refusing to delete/, name)
    }
  })
})
