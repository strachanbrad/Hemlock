/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import sharp from 'sharp'
import { JPEG, PNG, dataDir, loadApp } from './support/server.js'
import { coverFiles, placeCover } from './support/http.js'

let db
let coversDir
let withCoverFiles
let writeCover
let prepareUpload
before(async () => {
  const app = await loadApp()
  ;({ prepareUpload, withCoverFiles, writeCover } = await import('../src/coverFiles.js'))
  db = app.openDb(dataDir)
  coversDir = app.coversDir
})
after(() => {
  db.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
})
beforeEach(() => {
  db.exec("DELETE FROM editions; DELETE FROM books; DELETE FROM authors; INSERT INTO authors (id, name) VALUES (1, 'A'); INSERT INTO books (id, title, author_id, cover) VALUES (1, 'B', 1, 'b1-0000000a.jpg')")
  fs.rmSync(coversDir, { recursive: true, force: true })
  placeCover(coversDir, 'b1-0000000a.jpg', JPEG)
})

const COVER = { buffer: JPEG, ext: 'jpg' }

describe('prepareUpload', () => {
  it('stores an uploaded PNG as a JPEG and gives null without a file', async () => {
    const cover = await prepareUpload({ buffer: PNG, mimetype: 'image/png', originalname: 'x.png' })
    assert.equal(cover.ext, 'jpg')
    assert.equal((await sharp(cover.buffer).metadata()).format, 'jpeg')
    assert.equal(await prepareUpload(null, undefined), null)
  })

  it('refuses a second cover source and a file that is not an image', async () => {
    await assert.rejects(prepareUpload({ buffer: JPEG }, 'https://covers.openlibrary.org/b/id/1-L.jpg'), { status: 400, message: /one cover at most/ })
    await assert.rejects(prepareUpload({ buffer: Buffer.from('GIF89a') }), { status: 400, message: 'The cover must be a JPEG, PNG or WebP image' })
  })
})

describe('writeCover', () => {
  it('names the file by the base, eight random hex digits and the extension of the prepared cover', () => {
    const name = writeCover(COVER, 'e7')
    assert.match(name, /^e7-[0-9a-f]{8}\.jpg$/)
    assert.ok(fs.readFileSync(path.join(coversDir, name)).equals(JPEG))
  })

  it('refuses a file that did not come through prepareUpload', () => {
    assert.throws(() => writeCover({ buffer: PNG, mimetype: 'image/png', originalname: 'x.png' }, 'e7'), TypeError)
  })
})

describe('withCoverFiles', () => {
  it('removes the file it wrote when the transaction throws after the write', () => {
    assert.throws(() => withCoverFiles(db, (files) => {
      const name = files.write(COVER, 'b1')
      db.prepare('UPDATE books SET cover = ? WHERE id = 1').run(name)
      throw new Error('after the write')
    }), /after the write/)
    assert.deepEqual(coverFiles(coversDir), ['b1-0000000a.jpg'])
    assert.equal(db.prepare('SELECT cover FROM books WHERE id = 1').pluck().get(), 'b1-0000000a.jpg')
  })

  it('deletes a discarded cover only after the commit', () => {
    let presentInside
    const name = withCoverFiles(db, (files) => {
      files.discard('b1-0000000a.jpg')
      const written = files.write(COVER, 'b1')
      db.prepare('UPDATE books SET cover = ? WHERE id = 1').run(written)
      presentInside = fs.existsSync(path.join(coversDir, 'b1-0000000a.jpg'))
      return written
    })
    assert.equal(presentInside, true)
    assert.deepEqual(coverFiles(coversDir), [name])
  })

  it('keeps a discarded cover when the transaction rolls back', () => {
    assert.throws(() => withCoverFiles(db, (files) => {
      files.discard('b1-0000000a.jpg')
      db.prepare('UPDATE books SET cover = NULL WHERE id = 1').run()
      throw new Error('rolled back')
    }), /rolled back/)
    assert.deepEqual(coverFiles(coversDir), ['b1-0000000a.jpg'])
    assert.equal(db.prepare('SELECT cover FROM books WHERE id = 1').pluck().get(), 'b1-0000000a.jpg')
  })
})
