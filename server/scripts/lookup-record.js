/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import path from 'node:path'
import { config } from '../src/config.js'
import { toIsbn13 } from '../src/lib/isbn.js'
import { createLookup } from '../src/lookup/index.js'
import { fixtureName, fixturesDir, trimFixture } from '../test/support/fixtures.js'

const isbn = toIsbn13(process.argv[2] ?? '')
if (!isbn) {
  console.error('usage: npm run lookup:record -- <isbn>')
  process.exit(2)
}

const recorded = []
async function recordingFetch(url, init) {
  const response = await fetch(url, init)
  const name = fixtureName(url)
  if (name && response.ok) recorded.push({ name, body: name.endsWith('.txt') ? await response.clone().text() : await response.clone().json() })
  return response
}

// The same client, limiter and User-Agent as the server, so recording keeps to Open Library's limits.
const lookup = createLookup({ fetch: recordingFetch, googleKey: config.googleBooksApiKey, contact: config.lookupContact })
const { status, body } = await lookup(isbn)

const today = new Date().toISOString().slice(0, 10)
for (const { name, body: raw } of recorded) {
  const file = path.join(fixturesDir, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (name.endsWith('.txt')) fs.writeFileSync(file, raw.endsWith('\n') ? raw : `${raw}\n`)
  else fs.writeFileSync(file, `${JSON.stringify({ _source: `recorded ${today} by npm run lookup:record -- ${isbn}`, ...trimFixture(name, raw) }, null, 2)}\n`)
  console.log(`wrote ${path.relative(process.cwd(), file)}`)
}
console.log(`HTTP ${status}`)
console.log(JSON.stringify(body, null, 2))
