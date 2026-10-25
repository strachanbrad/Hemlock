/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import path from 'node:path'
import { migrationFiles, migrationsDir } from '../src/migrate.js'

const name = process.argv[2]
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('usage: npm run db:new <short_description>   (lowercase letters, digits and underscores)')
  process.exit(2)
}

const version = (migrationFiles().at(-1)?.version ?? 0) + 1
if (version > 999) {
  console.error('Migration versions have three digits; 999 is the last.')
  process.exit(1)
}

const file = path.join(migrationsDir, `${String(version).padStart(3, '0')}_${name}.sql`)
fs.writeFileSync(file, '-- Copyright (c) 2023 Hemlock\n-- SPDX-License-Identifier: GPL-3.0-only\n\n', { flag: 'wx' })
console.log(`Created ${path.relative(process.cwd(), file)}`)
