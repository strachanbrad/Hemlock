/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { config } from '../src/config.js'
import { databaseFile, openDb } from '../src/db.js'
import { schemaVersion } from '../src/migrate.js'

const db = openDb()
console.log(`${databaseFile(config.dataDir)} is at schema ${schemaVersion(db)}`)
db.close()
