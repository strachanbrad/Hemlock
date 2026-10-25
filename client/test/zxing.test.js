/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ZXING_WASM_SHA256, ZXING_WASM_VERSION } from 'barcode-detector/ponyfill'

const require = createRequire(import.meta.url)
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

// zxing-wasm exports no ./package.json, so its manifest is found by walking up from its entry.
function zxingPackageDir() {
  for (let dir = path.dirname(require.resolve('zxing-wasm')); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = path.join(dir, 'package.json')
    if (fs.existsSync(manifest) && readJson(manifest).name === 'zxing-wasm') return dir
  }
  throw new Error('zxing-wasm is not installed')
}

describe('the self-hosted ZXing WASM', () => {
  it('is the version the barcode-detector glue was built for', () => {
    expect(readJson(path.join(zxingPackageDir(), 'package.json')).version).toBe(ZXING_WASM_VERSION)
  })

  it('is the very binary the glue expects', () => {
    const wasm = fs.readFileSync(path.join(zxingPackageDir(), 'dist/reader/zxing_reader.wasm'))
    expect(crypto.createHash('sha256').update(wasm).digest('hex')).toBe(ZXING_WASM_SHA256)
  })

  it('is pinned to that exact version in client/package.json', () => {
    expect(readJson(path.join(import.meta.dirname, '../package.json')).dependencies['zxing-wasm']).toBe(ZXING_WASM_VERSION)
  })
})
