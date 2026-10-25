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

  it('deletes only server-generated names and ignores a missing file', () => {
    assert.equal(covers.coversDir, path.join(dataDir, 'covers'))
    fs.mkdirSync(covers.coversDir, { recursive: true })
    fs.writeFileSync(path.join(covers.coversDir, 'b3-0123abcd.jpg'), JPEG)
    covers.deleteCover('b3-0123abcd.jpg')
    assert.ok(!fs.existsSync(path.join(covers.coversDir, 'b3-0123abcd.jpg')))
    covers.deleteCover('b3-0123abcd.jpg')
    covers.deleteCover('e12-0123abcd.webp')
    for (const name of ['../hemlock.db', 'hemlock.db', '.e12-0123abcd.jpg.tmp', '9780156029438.jpg', 'e12-0123abcd.gif', 'e12-XYZ.jpg', 'e0-0123abcd.jpg', 'x12-0123abcd.jpg']) {
      assert.throws(() => covers.deleteCover(name), /Refusing to delete/, name)
    }
  })
})
