/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { config } from '../src/config.js'
import { databaseFile } from '../src/db.js'
import { resetDatabase, resetRefusal } from '../src/reset.js'

const refusal = resetRefusal(config, { force: process.argv.includes('--force') })
if (refusal) {
  console.error(refusal)
  process.exit(1)
}

const result = resetDatabase(config.dataDir)
console.log(`Reset ${databaseFile(config.dataDir)} to schema ${result.schema}: ${result.authors} authors, ${result.books} books, ${result.editions} editions, ${result.covers} covers`)
