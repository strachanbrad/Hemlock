/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it } from 'vitest'
import { createLatest } from '../src/lib/latest.js'

describe('createLatest', () => {
  it('treats only the newest request per key as current', () => {
    const latest = createLatest()
    const first = latest.start(1)
    const second = latest.start(1)
    expect(first()).toBe(false)
    expect(second()).toBe(true)
  })

  it('keeps keys apart', () => {
    const latest = createLatest()
    const one = latest.start(1)
    const two = latest.start(2)
    expect(one()).toBe(true)
    expect(two()).toBe(true)
  })
})
