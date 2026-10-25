/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { localDate } from '../src/lib/dates.js'

const zone = process.env.TZ
afterEach(() => {
  if (zone === undefined) delete process.env.TZ
  else process.env.TZ = zone
})

describe('localDate', () => {
  it('shows a UTC timestamp as the date where the browser is', () => {
    process.env.TZ = 'America/New_York'
    expect(localDate('2026-10-25 02:00:00')).toBe('2026-10-24')
    process.env.TZ = 'Australia/Sydney'
    expect(localDate('2026-10-24 22:30:00')).toBe('2026-10-25')
    process.env.TZ = 'UTC'
    expect(localDate('2026-10-24 23:59:59')).toBe('2026-10-24')
  })

  it('falls back to the stored date for a value it cannot read', () => {
    expect(localDate('2026-10-24')).toBe('2026-10-24')
    expect(localDate('not a date')).toBe('not a date')
  })
})
