/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { defaultDataDir, loadConfig, repoRoot } from '../src/config.js'

describe('loadConfig', () => {
  it('defaults to the checkout data directory, port 5000 and the loopback address', () => {
    const config = loadConfig({})
    assert.equal(config.dataDir, path.join(repoRoot, 'data'))
    assert.equal(config.dataDir, defaultDataDir)
    assert.equal(config.port, 5000)
    assert.equal(config.host, '127.0.0.1')
    assert.equal(config.production, false)
  })

  it('refuses to start in production without DATA_DIR', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /DATA_DIR must be set/)
    assert.throws(() => loadConfig({ NODE_ENV: 'production', DATA_DIR: '' }), /DATA_DIR must be set/)
    assert.equal(loadConfig({ NODE_ENV: 'production', DATA_DIR: '/var/lib/hemlock' }).dataDir, '/var/lib/hemlock')
  })

  it('binds the loopback address when HOST is empty', () => {
    assert.equal(loadConfig({ HOST: '' }).host, '127.0.0.1')
    assert.equal(loadConfig({ HOST: '0.0.0.0' }).host, '0.0.0.0')
  })

  it('resolves a relative DATA_DIR against the repository root', () => {
    assert.equal(loadConfig({ DATA_DIR: 'elsewhere' }).dataDir, path.join(repoRoot, 'elsewhere'))
  })

  it('refuses a PORT that is not a port number', () => {
    assert.equal(loadConfig({ PORT: '5100' }).port, 5100)
    for (const PORT of ['abc', '70000', '-1', '50.5']) assert.throws(() => loadConfig({ PORT }), /PORT is not a port number/, PORT)
  })
  it('trusts loopback and the proxies named in TRUSTED_PROXIES', () => {
    assert.deepEqual(loadConfig({}).trustProxy, ['loopback'])
    assert.deepEqual(loadConfig({ TRUSTED_PROXIES: ' 10.0.2.6, 10.0.4.0/24 ,' }).trustProxy, ['loopback', '10.0.2.6', '10.0.4.0/24'])
    for (const TRUSTED_PROXIES of ['proxy', '10.0.2', '10.0.2.6/x', '10.0.2.6/24/1']) {
      assert.throws(() => loadConfig({ TRUSTED_PROXIES }), /TRUSTED_PROXIES/, TRUSTED_PROXIES)
    }
  })
})
