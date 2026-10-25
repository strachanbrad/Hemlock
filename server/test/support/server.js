/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import { tempDir } from './temp.js'

// config.js reads DATA_DIR once, when first imported, so a test file reaches the
// app's modules only through this helper and gets one data directory per process.
export const dataDir = tempDir()
process.env.DATA_DIR = dataDir

export const loadApp = async () => ({
  ...(await import('../../src/app.js')),
  ...(await import('../../src/covers.js')),
  ...(await import('../../src/db.js')),
})

// options reach createApp, for a test that injects the lookup or the cover download.
export async function startServer(options = {}) {
  const { createApp, openDb } = await loadApp()
  const db = openDb(dataDir)
  const server = await new Promise((resolve, reject) => {
    const listening = createApp({ db, ...options }).listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve(listening)))
  })
  return {
    db,
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve))
      db.close()
      fs.rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
export const WEBP = Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1')
