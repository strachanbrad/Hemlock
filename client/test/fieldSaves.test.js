/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it } from 'vitest'
import { createFieldSaves } from '../src/lib/fieldSaves.js'

const BOOK = { id: 1, star_rating: 0, read: false }

describe('createFieldSaves pending', () => {
  it('answers the newest value of each field whose newest save is unsettled, for that book only', () => {
    const saves = createFieldSaves()
    expect(saves.pending(1)).toEqual({})
    const first = saves.start(BOOK, { star_rating: 3 })
    const second = saves.start(BOOK, { star_rating: 5 })
    const read = saves.start(BOOK, { read: true })
    saves.start({ id: 2, star_rating: 0 }, { star_rating: 1 })
    expect(saves.pending(1)).toEqual({ star_rating: 5, read: true })
    expect(saves.pending(2)).toEqual({ star_rating: 1 })

    second({ ...BOOK, star_rating: 5 })
    expect(saves.pending(1)).toEqual({ read: true })
    first({ ...BOOK, star_rating: 3 })
    read(null)
    expect(saves.pending(1)).toEqual({})
  })
})
