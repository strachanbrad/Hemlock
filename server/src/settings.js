/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

export const SECRET_SETTINGS = new Set(['google_books_api_key', 'anthropic_api_key', 'admin_password_hash'])
export const PLAIN_SETTINGS = new Set(['anthropic_model', 'lookup_contact'])

const VERSION = 'v1'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

// The setting's name is the additional data, so a ciphertext copied into another row does not decrypt.
export function encrypt(name, plain, key) {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(Buffer.from(name))
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [VERSION, ...[iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url'))].join(':')
}

export function decrypt(name, stored, key) {
  const [version, iv, tag, data, ...rest] = stored.split(':')
  if (version !== VERSION || data === undefined || rest.length > 0) throw new Error('not a v1 secret')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'), { authTagLength: TAG_BYTES })
  decipher.setAAD(Buffer.from(name))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

// SECRETS_KEY when set, else DATA_DIR/secrets.key, written once (mode 0600) by the first encrypt.
export function secretKeyLoader({ secretsKey = config.secretsKey, dataDir = config.dataDir } = {}) {
  if (secretsKey) {
    const key = Buffer.from(secretsKey, 'hex')
    return () => key
  }
  const file = path.join(dataDir, 'secrets.key')
  let key = null
  return ({ create = false } = {}) => {
    if (key) return key
    let bytes
    try {
      bytes = fs.readFileSync(file)
    } catch (err) {
      if (err.code !== 'ENOENT' || !create) throw err
      bytes = crypto.randomBytes(KEY_BYTES)
      try {
        fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 })
      } catch (writeErr) {
        if (writeErr.code !== 'EEXIST') throw writeErr
        bytes = fs.readFileSync(file)
      }
    }
    if (bytes.length !== KEY_BYTES) throw new Error(`${file} does not hold ${KEY_BYTES} bytes`)
    key = bytes
    return key
  }
}

const hintOf = (name, value) => (SECRET_SETTINGS.has(name) ? value.slice(-4) : value)

// A value saved here wins over the environment's (`env`, by setting name). A secret that no longer
// decrypts (the key changed) counts as not set; it is logged once and never throws.
export function createSettings(db, {
  secretKey = secretKeyLoader(),
  env = { google_books_api_key: config.googleBooksApiKey, anthropic_api_key: config.anthropicApiKey, lookup_contact: config.lookupContact },
  log = console.warn,
} = {}) {
  const select = db.prepare('SELECT value, secret FROM settings WHERE key = ?')
  const upsert = db.prepare(`INSERT INTO settings (key, value, secret, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, secret = excluded.secret, updated_at = excluded.updated_at`)
  const remove = db.prepare('DELETE FROM settings WHERE key = ?')
  const unreadable = new Set()

  const known = (name) => {
    if (!SECRET_SETTINGS.has(name) && !PLAIN_SETTINGS.has(name)) throw new TypeError(`Unknown setting ${JSON.stringify(name)}`)
  }

  function saved(name) {
    const row = select.get(name)
    if (!row) return null
    if (!row.secret) return row.value
    try {
      return decrypt(name, row.value, secretKey())
    } catch (err) {
      if (!unreadable.has(row.value)) {
        unreadable.add(row.value)
        log(`Setting ${name} cannot be decrypted (${err.code === 'ENOENT' ? 'no secrets.key' : 'SECRETS_KEY or secrets.key changed?'}); treating it as not set`)
      }
      return null
    }
  }

  return {
    get(name) {
      known(name)
      return saved(name) ?? env[name] ?? null
    },
    set(name, value) {
      known(name)
      if (typeof value !== 'string' || value === '') throw new TypeError(`Setting ${name} needs a non-empty string`)
      const secret = SECRET_SETTINGS.has(name)
      upsert.run(name, secret ? encrypt(name, value, secretKey({ create: true })) : value, secret ? 1 : 0, new Date().toISOString())
    },
    clear(name) {
      known(name)
      remove.run(name)
    },
    status(name) {
      known(name)
      if (name === 'admin_password_hash') throw new TypeError('admin_password_hash has no status')
      const value = saved(name)
      if (value !== null) return { is_set: true, source: 'settings', hint: hintOf(name, value) }
      if (env[name]) return { is_set: true, source: 'env', hint: hintOf(name, env[name]) }
      return { is_set: false, source: null, hint: null }
    },
  }
}
