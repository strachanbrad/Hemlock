/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import sharp from 'sharp'
import { JPEG, PNG, WEBP, dataDir, image, loadApp } from './support/server.js'

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

const UNREADABLE = { status: 400, message: 'The cover could not be read as an image' }

describe('prepareCover', () => {
  it('scales a large PNG to a JPEG of 1600 px on its long side', async () => {
    const cover = await covers.prepareCover(await image({ width: 3000, height: 4500 }).png().toBuffer())
    const { format, width, height } = await sharp(cover.buffer).metadata()
    assert.deepEqual({ ext: cover.ext, format, width, height }, { ext: 'jpg', format: 'jpeg', width: 1067, height: 1600 })
  })

  it('keeps a JPEG that fits and carries no metadata byte for byte', async () => {
    const jpeg = await image({ width: 400, height: 600 }).jpeg({ quality: 95 }).toBuffer()
    const cover = await covers.prepareCover(jpeg)
    assert.equal(cover.ext, 'jpg')
    assert.ok(cover.buffer.equals(jpeg))
  })

  it('re-encodes a JPEG that fits but carries EXIF, so a phone photo loses its location', async () => {
    const jpeg = await image({ width: 400, height: 600 }).jpeg().withExif({ IFD0: { Artist: 'Phone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' } }).toBuffer()
    assert.ok((await sharp(jpeg).metadata()).exif)
    const { buffer } = await covers.prepareCover(jpeg)
    const { exif, width, height } = await sharp(buffer).metadata()
    assert.deepEqual({ exif, width, height }, { exif: undefined, width: 400, height: 600 })
  })

  it('puts opaque white behind a transparent PNG', async () => {
    const clear = await image({ width: 20, height: 30, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    const { buffer } = await covers.prepareCover(clear)
    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
    assert.equal(info.channels, 3)
    assert.ok(data.every((value) => value >= 250), 'every pixel is white')
  })

  it('turns a JPEG upright by its EXIF orientation and strips the EXIF', async () => {
    const sideways = await image({ width: 400, height: 600 }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    assert.equal((await sharp(sideways).metadata()).orientation, 6)
    const { buffer } = await covers.prepareCover(sideways)
    const { width, height, orientation, exif } = await sharp(buffer).metadata()
    assert.deepEqual({ width, height, orientation, exif }, { width: 600, height: 400, orientation: undefined, exif: undefined })
  })

  it('refuses a file that is not an image', async () => {
    await assert.rejects(covers.prepareCover(Buffer.from('<html>not a cover</html>')), { status: 400, message: 'The cover must be a JPEG, PNG or WebP image' })
  })

  it('refuses a truncated JPEG and a truncated PNG whose headers still read', async () => {
    const noisy = image({ width: 400, height: 600 }).composite([{ input: { create: { width: 400, height: 600, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } } }])
    const jpeg = await noisy.clone().jpeg().toBuffer()
    const png = await noisy.clone().png().toBuffer()
    for (const whole of [jpeg, png]) {
      const half = whole.subarray(0, whole.length >> 1)
      assert.equal((await sharp(half).metadata()).width, 400)
      await assert.rejects(covers.prepareCover(half), UNREADABLE)
    }
  })

  it('refuses an image of more than 50 megapixels before decoding it', async () => {
    const bomb = await image({ width: 7100, height: 7100 }).png().toBuffer()
    assert.ok(bomb.length < 1024 * 1024)
    await assert.rejects(covers.prepareCover(bomb), UNREADABLE)
  })
})
