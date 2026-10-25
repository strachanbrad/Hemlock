/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { loadConfig } from '../src/config.js'
import { openDb } from '../src/db.js'
import { createSettings, decrypt, encrypt, secretKeyLoader } from '../src/settings.js'
import { tempDir } from './support/temp.js'

const KEY = crypto.randomBytes(32)
const GOOGLE = 'google-test-key-0123456789hijk'
const dirs = []
after(() => dirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })))

function setup({ env = {}, secretKey = () => KEY } = {}) {
  const dir = tempDir()
  dirs.push(dir)
  const db = openDb(dir)
  const logs = []
  const settings = createSettings(db, { secretKey, env, log: (line) => logs.push(line) })
  return { db, dir, settings, logs }
}

describe('settings', () => {
  it('round-trips a secret, stored only as ciphertext', () => {
    const { db, settings } = setup()
    settings.set('google_books_api_key', GOOGLE)
    assert.equal(settings.get('google_books_api_key'), GOOGLE)
    const row = db.prepare("SELECT value, secret, updated_at FROM settings WHERE key = 'google_books_api_key'").get()
    assert.equal(row.secret, 1)
    assert.match(row.value, /^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$/)
    assert.ok(!row.value.includes(GOOGLE))
    assert.ok(!Number.isNaN(Date.parse(row.updated_at)))
    assert.deepEqual(settings.status('google_books_api_key'), { is_set: true, source: 'settings', hint: 'hijk' })
  })

  it('stores a plain setting as is and hints with its whole value', () => {
    const { db, settings } = setup()
    settings.set('anthropic_model', 'claude-sonnet-5-5')
    assert.deepEqual(db.prepare("SELECT value, secret FROM settings WHERE key = 'anthropic_model'").get(), { value: 'claude-sonnet-5-5', secret: 0 })
    assert.deepEqual(settings.status('anthropic_model'), { is_set: true, source: 'settings', hint: 'claude-sonnet-5-5' })
  })

  it('falls back to the environment, and a saved value wins over it', () => {
    const { settings } = setup({ env: { google_books_api_key: 'env-key-wxyz', lookup_contact: 'env@example.org' } })
    assert.equal(settings.get('google_books_api_key'), 'env-key-wxyz')
    assert.deepEqual(settings.status('google_books_api_key'), { is_set: true, source: 'env', hint: 'wxyz' })
    assert.deepEqual(settings.status('lookup_contact'), { is_set: true, source: 'env', hint: 'env@example.org' })
    settings.set('google_books_api_key', GOOGLE)
    assert.equal(settings.get('google_books_api_key'), GOOGLE)
    settings.clear('google_books_api_key')
    assert.equal(settings.get('google_books_api_key'), 'env-key-wxyz')
  })

  it('answers not set with no value anywhere', () => {
    const { settings } = setup()
    for (const name of ['google_books_api_key', 'anthropic_api_key', 'anthropic_model', 'lookup_contact']) {
      assert.equal(settings.get(name), null)
      assert.deepEqual(settings.status(name), { is_set: false, source: null, hint: null })
    }
  })

  it('counts a secret saved under another key as not set, logging one line and never throwing', () => {
    const { db, dir, settings, logs } = setup({ env: { anthropic_api_key: 'env-fallback' } })
    settings.set('anthropic_api_key', 'sk-ant-saved')
    const rotated = createSettings(db, { secretKey: () => crypto.randomBytes(32), env: { anthropic_api_key: 'env-fallback' }, log: (line) => logs.push(line) })
    assert.equal(rotated.get('anthropic_api_key'), 'env-fallback')
    assert.deepEqual(rotated.status('anthropic_api_key'), { is_set: true, source: 'env', hint: 'back' })
    assert.equal(rotated.get('anthropic_api_key'), 'env-fallback')
    assert.deepEqual(logs, ['Setting anthropic_api_key cannot be decrypted (SECRETS_KEY or secrets.key changed?); treating it as not set'])
    assert.ok(!fs.existsSync(path.join(dir, 'secrets.key')))
  })

  it('refuses an unknown setting and gives the password hash no status', () => {
    const { settings } = setup()
    assert.throws(() => settings.get('anthropic_base_url'), TypeError)
    assert.throws(() => settings.set('nope', 'x'), TypeError)
    assert.throws(() => settings.status('admin_password_hash'), TypeError)
    assert.throws(() => settings.set('anthropic_model', ''), TypeError)
  })
})

describe('encryption', () => {
  it('binds the ciphertext to the setting it belongs to', () => {
    const stored = encrypt('google_books_api_key', 'value', KEY)
    assert.equal(decrypt('google_books_api_key', stored, KEY), 'value')
    assert.throws(() => decrypt('anthropic_api_key', stored, KEY))
    assert.throws(() => decrypt('google_books_api_key', stored.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), KEY))
    assert.throws(() => decrypt('google_books_api_key', 'plain text', KEY))
    assert.notEqual(encrypt('google_books_api_key', 'value', KEY), stored)
  })
})

describe('secretKeyLoader', () => {
  it('creates DATA_DIR/secrets.key on the first encrypt, mode 0600, and reuses it', () => {
    const dir = tempDir()
    dirs.push(dir)
    const file = path.join(dir, 'secrets.key')
    const load = secretKeyLoader({ secretsKey: null, dataDir: dir })
    assert.throws(() => load(), { code: 'ENOENT' })
    assert.ok(!fs.existsSync(file))
    const key = load({ create: true })
    assert.equal(key.length, 32)
    assert.equal(fs.statSync(file).mode & 0o777, 0o600)
    assert.ok(fs.readFileSync(file).equals(key))
    assert.ok(secretKeyLoader({ secretsKey: null, dataDir: dir })().equals(key))
  })

  it('uses SECRETS_KEY when it is set and writes no file', () => {
    const dir = tempDir()
    dirs.push(dir)
    const hex = crypto.randomBytes(32).toString('hex')
    assert.ok(secretKeyLoader({ secretsKey: hex, dataDir: dir })({ create: true }).equals(Buffer.from(hex, 'hex')))
    assert.deepEqual(fs.readdirSync(dir), [])
  })

  it('refuses a secrets.key that is not 32 bytes', () => {
    const dir = tempDir()
    dirs.push(dir)
    fs.writeFileSync(path.join(dir, 'secrets.key'), 'short')
    assert.throws(() => secretKeyLoader({ secretsKey: null, dataDir: dir })(), /does not hold 32 bytes/)
  })

  it('makes a saved secret readable again only with the same key file', () => {
    const { db, dir } = setup()
    const first = createSettings(db, { secretKey: secretKeyLoader({ secretsKey: null, dataDir: dir }), env: {} })
    first.set('google_books_api_key', GOOGLE)
    const again = createSettings(db, { secretKey: secretKeyLoader({ secretsKey: null, dataDir: dir }), env: {} })
    assert.equal(again.get('google_books_api_key'), GOOGLE)
  })
})

describe('SECRETS_KEY configuration', () => {
  it('reads 64 hex characters and refuses anything else', () => {
    const hex = 'ab'.repeat(32)
    assert.equal(loadConfig({ SECRETS_KEY: ` ${hex} ` }).secretsKey, hex)
    assert.equal(loadConfig({}).secretsKey, null)
    for (const SECRETS_KEY of ['ab'.repeat(31), 'zz'.repeat(32), 'secret']) {
      assert.throws(() => loadConfig({ SECRETS_KEY }), /SECRETS_KEY is not 64 hexadecimal characters/)
    }
  })

  it('reads ANTHROPIC_API_KEY, trimmed and optional', () => {
    assert.equal(loadConfig({ ANTHROPIC_API_KEY: ' sk-ant-x ' }).anthropicApiKey, 'sk-ant-x')
    assert.equal(loadConfig({ ANTHROPIC_API_KEY: '' }).anthropicApiKey, null)
  })
})
