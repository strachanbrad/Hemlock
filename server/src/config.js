/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import path from 'node:path'

export const repoRoot = path.resolve(import.meta.dirname, '../..')
export const defaultDataDir = path.join(repoRoot, 'data')

export const userAgent = (version, contact) => `Hemlock/${version} (github.com/strachanbrad/hemlock${contact ? `; ${contact}` : ''})`

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  if (production && !env.DATA_DIR) throw new Error('DATA_DIR must be set when NODE_ENV=production')

  const port = env.PORT ? Number(env.PORT) : 5000
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT is not a port number: ${env.PORT}`)

  // The contact goes into a User-Agent header, which whitespace, parentheses or a semicolon would break.
  const lookupContact = env.LOOKUP_CONTACT?.trim() || null
  if (lookupContact && !/^[^\s();@]+@[^\s();@]+$/.test(lookupContact)) throw new Error('LOOKUP_CONTACT is not an email address')

  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version

  return Object.freeze({
    production,
    dataDir: env.DATA_DIR ? path.resolve(repoRoot, env.DATA_DIR) : defaultDataDir,
    port,
    // Never ??: an empty HOST must not bind every interface.
    host: env.HOST || '127.0.0.1',
    version,
    googleBooksApiKey: env.GOOGLE_BOOKS_API_KEY?.trim() || null,
    lookupContact,
    userAgent: userAgent(version, lookupContact),
  })
}

export const config = loadConfig()
