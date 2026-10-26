/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

export const repoRoot = path.resolve(import.meta.dirname, '../..')
export const defaultDataDir = path.join(repoRoot, 'data')

export const userAgent = (version, contact) => `Hemlock/${version} (github.com/strachanbrad/hemlock${contact ? `; ${contact}` : ''})`

// The contact goes into a User-Agent header, which whitespace, parentheses or a semicolon would break.
export const isContact = (value) => /^[^\s();@]+@[^\s();@]+$/.test(value)

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  if (production && !env.DATA_DIR) throw new Error('DATA_DIR must be set when NODE_ENV=production')

  const port = env.PORT ? Number(env.PORT) : 5000
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT is not a port number: ${env.PORT}`)

  const lookupContact = env.LOOKUP_CONTACT?.trim() || null
  if (lookupContact && !isContact(lookupContact)) throw new Error('LOOKUP_CONTACT is not an email address')

  const secretsKey = env.SECRETS_KEY?.trim() || null
  if (secretsKey && !/^[0-9a-f]{64}$/i.test(secretsKey)) throw new Error('SECRETS_KEY is not 64 hexadecimal characters')

  // Proxies in front of nginx, whose X-Forwarded-For entries name the visitor; nginx itself is loopback.
  const trustedProxies = (env.TRUSTED_PROXIES ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  for (const proxy of trustedProxies) {
    const [address, prefix, ...rest] = proxy.split('/')
    const valid = net.isIP(address) && rest.length === 0 && (prefix === undefined || /^\d{1,3}$/.test(prefix))
    if (!valid) throw new Error(`TRUSTED_PROXIES holds something that is not an IP address or network: ${proxy}`)
  }

  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version

  return Object.freeze({
    production,
    dataDir: env.DATA_DIR ? path.resolve(repoRoot, env.DATA_DIR) : defaultDataDir,
    port,
    // Never ??: an empty HOST must not bind every interface.
    host: env.HOST || '127.0.0.1',
    version,
    googleBooksApiKey: env.GOOGLE_BOOKS_API_KEY?.trim() || null,
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    lookupContact,
    secretsKey,
    trustProxy: ['loopback', ...trustedProxies],
    userAgent: userAgent(version, lookupContact),
  })
}

export const config = loadConfig()
