/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { startServer } from './support/server.js'
import { client } from './support/http.js'

const rootVersion = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../package.json'), 'utf8')).version

let app
let api
before(async () => {
  app = await startServer()
  api = client(app.base)
})
after(() => app.close())

describe('GET /api/health', () => {
  it('answers ok with the app version and the highest applied migration', async () => {
    assert.deepEqual(await api.get('/api/health'), { status: 200, body: { ok: true, version: rootVersion, schema: 2 } })
  })
})

describe('errors', () => {
  it('answer JSON for an unknown path and for malformed JSON', async () => {
    assert.deepEqual(await api.get('/api/nothing/here/at/all'), { status: 404, body: { error: 'Not found' } })
    assert.deepEqual(await api.get('/covers/e1-00000000.jpg'), { status: 404, body: { error: 'Not found' } })
    const { status, body } = await api.post('/api/books', '{bad')
    assert.equal(status, 400)
    assert.equal(typeof body.error, 'string')
  })
})

describe('the generic routes', () => {
  it('are gone', async () => {
    for (const [method, url] of [
      ['POST', '/api/data/Authors'],
      ['DELETE', '/api/data/Books/9780553212587'],
      ['GET', '/api/Books/get'],
      ['GET', '/api/EBooks/author/1'],
      ['POST', '/api/Books/9780553212587/update'],
      ['POST', '/api/convertEBookToBook'],
    ]) {
      const response = await fetch(app.base + url, { method })
      assert.equal(response.status, 404, `${method} ${url}`)
    }
  })
})
