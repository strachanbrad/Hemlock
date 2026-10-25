/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import path from 'node:path'

export const repoRoot = path.resolve(import.meta.dirname, '../..')
export const defaultDataDir = path.join(repoRoot, 'data')

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  if (production && !env.DATA_DIR) throw new Error('DATA_DIR must be set when NODE_ENV=production')

  const port = env.PORT ? Number(env.PORT) : 5000
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT is not a port number: ${env.PORT}`)

  return Object.freeze({
    production,
    dataDir: env.DATA_DIR ? path.resolve(repoRoot, env.DATA_DIR) : defaultDataDir,
    port,
    // Never ??: an empty HOST must not bind every interface.
    host: env.HOST || '127.0.0.1',
    version: JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version,
  })
}

export const config = loadConfig()
