/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import path from 'node:path'
import { publish } from 'roku-deploy'

const dist = path.resolve(import.meta.dirname, '../../dist')
const { ROKU_IP: host, ROKU_USERNAME: username = 'rokudev', ROKU_PASSWORD: password } = process.env

if (!host || !password) {
  console.error('Set ROKU_IP and ROKU_PASSWORD (and ROKU_USERNAME when it is not rokudev) in the environment.')
  process.exit(1)
}
if (!fs.existsSync(path.join(dist, 'hemlock-roku.zip'))) {
  console.error('dist/hemlock-roku.zip is missing: run npm run roku:build first.')
  process.exit(1)
}

try {
  await publish({ host, username, password, outDir: dist, outFile: 'hemlock-roku', failOnCompileError: true })
  console.log(`Installed on ${host}; the channel starts by itself.`)
} catch (error) {
  // The error can carry the request options, password included, so only its message is printed.
  console.error(`Install failed: ${error.message}`)
  process.exit(1)
}
