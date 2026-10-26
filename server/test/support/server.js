/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import sharp from 'sharp'
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

// Every API route but a few needs a session: this opens one for a user named test, whose password
// hash matches no password, and answers the Cookie header that carries it.
export async function signIn(db, { now } = {}) {
  const { createUsers } = await import('../../src/users.js')
  db.prepare("INSERT OR IGNORE INTO users (name, password_hash, created_at) VALUES ('test', 'none', '2026-01-01T00:00:00.000Z')").run()
  const id = db.prepare("SELECT id FROM users WHERE name = 'test'").pluck().get()
  return `hemlock_session=${createUsers(db, { now }).open(id)}`
}

// options reach createApp, for a test that injects the lookup, the settings or the cover download;
// a function receives the database first.
export async function startServer(options = {}) {
  const { createApp, openDb } = await loadApp()
  const db = openDb(dataDir)
  const extra = typeof options === 'function' ? options(db) : options
  const server = await new Promise((resolve, reject) => {
    const listening = createApp({ db, ...extra }).listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve(listening)))
  })
  return {
    db,
    base: `http://127.0.0.1:${server.address().port}`,
    cookie: await signIn(db, { now: extra.now }),
    async close() {
      await new Promise((resolve) => server.close(resolve))
      db.close()
      fs.rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

// Real images, since every upload and download is decoded before it is stored.
export const image = ({ width = 4, height = 6, channels = 3, background = '#7a5c3e' } = {}) => sharp({ create: { width, height, channels, background } })
export const JPEG = await image().jpeg().toBuffer()
export const PNG = await image().png().toBuffer()
export const WEBP = await image().webp().toBuffer()
