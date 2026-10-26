/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { send } from './support/http.js'
import { startServer } from './support/server.js'

const { createUsers } = await import('../src/users.js')

const PROXY = '10.0.2.6'
let app

before(async () => {
  app = await startServer({ trustProxy: ['loopback', PROXY] })
  createUsers(app.db).add('Ana', 'correct horse battery')
})
after(() => app.close())

const login = (name, forwarded) =>
  send(app.base, 'POST', '/api/login', { body: { name, password: 'wrong password' }, headers: { 'X-Forwarded-For': forwarded } })
const pair = (forwarded) => send(app.base, 'POST', '/api/devices/pair', { headers: { 'X-Forwarded-For': forwarded } })

describe('the visitor address behind trusted proxies', () => {
  it('counts the login lockout per forwarded visitor, not per proxy', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await login(`guess${i}`, `203.0.113.5, ${PROXY}`)).status, 401)
    assert.equal((await login('guess5', `203.0.113.5, ${PROXY}`)).status, 429)
    assert.equal((await login('guess6', `203.0.113.6, ${PROXY}`)).status, 401)
  })

  it('believes only the entries trusted proxies added, so a visitor cannot pose as another', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await login(`g${i}`, `198.51.100.9, ${PROXY}`)).status, 401)
    assert.equal((await login('g5', `1.2.3.4, 198.51.100.9, ${PROXY}`)).status, 429)
  })

  it('limits pairings per forwarded visitor', async () => {
    for (let i = 0; i < 3; i++) assert.equal((await pair(`203.0.113.50, ${PROXY}`)).status, 200)
    assert.equal((await pair(`203.0.113.50, ${PROXY}`)).status, 429)
    assert.equal((await pair(`203.0.113.51, ${PROXY}`)).status, 200)
  })
})
