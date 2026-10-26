/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { config } from '../src/config.js'
import { databaseFile, openDb } from '../src/db.js'
import { createUsers, validName, validPassword } from '../src/users.js'
import { readPassword } from './password.js'

// The name is not a secret and comes from the argument; the password never does: argv is visible to every local user in ps.
if (process.argv.length !== 3) {
  console.error('usage: npm run user:add <name>   (type the password at the prompt, or pipe one line to it)')
  process.exit(2)
}

const fail = (message) => {
  console.error(`${message[0].toUpperCase()}${message.slice(1)}; nothing changed`)
  process.exit(1)
}

let name
let password
try {
  name = validName(process.argv[2])
  password = validPassword(await readPassword(`Password for ${name}: `))
} catch (err) {
  fail(err.message)
}

const db = openDb()
let taken = null
try {
  createUsers(db).add(name, password)
} catch (err) {
  if (err.status !== 409) throw err
  taken = err.message
} finally {
  db.close()
}
if (taken) fail(taken)
console.log(`Added ${name} to ${databaseFile(config.dataDir)}`)
