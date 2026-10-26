/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { MAX_PASSWORD, MIN_PASSWORD, endAllSessions, hashPassword } from '../src/auth.js'
import { config } from '../src/config.js'
import { databaseFile, openDb } from '../src/db.js'
import { createSettings } from '../src/settings.js'
import { readPassword } from './password.js'

// The password never comes from an argument: argv is visible to every local user in ps.
if (process.argv.length > 2) {
  console.error('usage: npm run admin:password   (type the password at the prompt, or pipe one line to it)')
  process.exit(2)
}

let password
try {
  password = await readPassword('New admin password: ')
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
if ([...password].length < MIN_PASSWORD) {
  console.error(`The password needs at least ${MIN_PASSWORD} characters; nothing changed`)
  process.exit(1)
}
if (password.length > MAX_PASSWORD) {
  console.error(`The password is longer than ${MAX_PASSWORD} characters; nothing changed`)
  process.exit(1)
}

const db = openDb()
try {
  const ended = db.transaction(() => {
    createSettings(db).set('admin_password_hash', hashPassword(password))
    return endAllSessions(db)
  })()
  console.log(`Admin password set in ${databaseFile(config.dataDir)}; ${ended === 1 ? '1 session' : `${ended} sessions`} ended`)
} finally {
  db.close()
}
