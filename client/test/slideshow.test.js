/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it } from 'vitest'
import { applyBooks, createShow, currentIndex, readOptions, step, togglePause } from '../src/pages/Display/slideshow.js'

const T0 = 1_700_000_000_000
const S = 10_000

const list = (...ids) => ids.map((id) => ({ id, title: id }))

const showOf = (books, t = T0) => {
  const show = createShow(S, t)
  applyBooks(show, books, t)
  return show
}

const shown = (show, t) => show.books[currentIndex(show, t)]?.id

describe('currentIndex', () => {
  it('shows each book for one interval and wraps after the last', () => {
    const show = showOf(list('a', 'b', 'c'))
    expect(shown(show, T0)).toBe('a')
    expect(shown(show, T0 + S - 1)).toBe('a')
    expect(shown(show, T0 + S)).toBe('b')
    expect(shown(show, T0 + 2 * S)).toBe('c')
    expect(shown(show, T0 + 3 * S)).toBe('a')
    expect(shown(show, T0 + 7 * S + 5)).toBe('b')
  })

  it('catches up from the clock alone after an hour with no tick', () => {
    const show = showOf(list('a', 'b', 'c', 'd', 'e', 'f', 'g'))
    expect(currentIndex(show, T0 + 60 * 60 * 1000)).toBe(360 % 7)
  })

  it('answers -1 for an empty list', () => {
    expect(currentIndex(createShow(S, T0), T0)).toBe(-1)
    expect(currentIndex(showOf([]), T0 + S)).toBe(-1)
  })

  it('re-anchors when the clock moves backwards, then advances from there', () => {
    const show = showOf(list('a', 'b', 'c'))
    expect(shown(show, T0 + 2 * S + 1)).toBe('c')
    const back = T0 - 24 * 60 * 60 * 1000
    const index = currentIndex(show, back)
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(3)
    expect(currentIndex(show, back + S - 1)).toBe(index)
    expect(currentIndex(show, back + S)).toBe((index + 1) % 3)
  })
})

describe('applyBooks', () => {
  it('gives the first book of the first list a full interval from the load', () => {
    const show = createShow(S, T0)
    applyBooks(show, list('a', 'b'), T0 + 3000)
    expect(shown(show, T0 + 3000 + S - 1)).toBe('a')
    expect(shown(show, T0 + 3000 + S)).toBe('b')
  })

  it('keeps the book on screen by id and its slot end when the list grows', () => {
    const show = showOf(list('a', 'b', 'c'))
    expect(shown(show, T0 + 12_000)).toBe('b')
    applyBooks(show, list('a', 'a2', 'b', 'c'), T0 + 12_000)
    expect(shown(show, T0 + 12_000)).toBe('b')
    expect(shown(show, T0 + 2 * S - 1)).toBe('b')
    expect(shown(show, T0 + 2 * S)).toBe('c')
    expect(shown(show, T0 + 3 * S)).toBe('a')
  })

  it('yields the position of a deleted book to the one after it, keeping the slot end', () => {
    const show = showOf(list('a', 'b', 'c'))
    applyBooks(show, list('a', 'c'), T0 + 12_000)
    expect(shown(show, T0 + 12_000)).toBe('c')
    expect(shown(show, T0 + 2 * S - 1)).toBe('c')
    expect(shown(show, T0 + 2 * S)).toBe('a')
  })

  it('wraps a deleted last book to the first', () => {
    const show = showOf(list('a', 'b', 'c'))
    applyBooks(show, list('a', 'b'), T0 + 2 * S + 1)
    expect(shown(show, T0 + 2 * S + 1)).toBe('a')
  })

  it('empties the show and starts again with a full interval when books return', () => {
    const show = showOf(list('a', 'b'))
    applyBooks(show, [], T0 + 4000)
    expect(currentIndex(show, T0 + 4000)).toBe(-1)
    applyBooks(show, list('x', 'y'), T0 + 50_000)
    expect(shown(show, T0 + 50_000 + S - 1)).toBe('x')
    expect(shown(show, T0 + 50_000 + S)).toBe('y')
  })

  it('keeps the remaining time of a paused show', () => {
    const show = showOf(list('a', 'b', 'c'))
    togglePause(show, T0 + 4000)
    applyBooks(show, list('a0', 'a', 'b', 'c'), T0 + 100_000)
    expect(shown(show, T0 + 100_000)).toBe('a')
    togglePause(show, T0 + 200_000)
    expect(shown(show, T0 + 200_000 + 6000 - 1)).toBe('a')
    expect(shown(show, T0 + 200_000 + 6000)).toBe('b')
  })
})

describe('step', () => {
  it('moves to the next book and gives it a full interval', () => {
    const show = showOf(list('a', 'b', 'c'))
    step(show, T0 + 7000, 1)
    expect(shown(show, T0 + 7000)).toBe('b')
    expect(shown(show, T0 + 7000 + S - 1)).toBe('b')
    expect(shown(show, T0 + 7000 + S)).toBe('c')
  })

  it('wraps backwards from the first book to the last', () => {
    const show = showOf(list('a', 'b', 'c'))
    step(show, T0 + 1000, -1)
    expect(shown(show, T0 + 1000)).toBe('c')
    step(show, T0 + 2000, 1)
    expect(shown(show, T0 + 2000)).toBe('a')
  })

  it('stays paused on the new book, which gets a full interval on resume', () => {
    const show = showOf(list('a', 'b', 'c'))
    togglePause(show, T0 + 3000)
    step(show, T0 + 60_000, 1)
    expect(shown(show, T0 + 500_000)).toBe('b')
    togglePause(show, T0 + 500_000)
    expect(shown(show, T0 + 500_000 + S - 1)).toBe('b')
    expect(shown(show, T0 + 500_000 + S)).toBe('c')
  })

  it('does nothing on an empty list', () => {
    const show = createShow(S, T0)
    step(show, T0, 1)
    expect(currentIndex(show, T0)).toBe(-1)
  })
})

describe('togglePause', () => {
  it('freezes the book and resumes with the time that remained', () => {
    const show = showOf(list('a', 'b', 'c'))
    togglePause(show, T0 + 5000)
    expect(show.pausedAt).toBe(T0 + 5000)
    expect(shown(show, T0 + 445_000)).toBe('a')
    togglePause(show, T0 + 445_000)
    expect(show.pausedAt).toBeNull()
    expect(shown(show, T0 + 450_000 - 1)).toBe('a')
    expect(shown(show, T0 + 450_000)).toBe('b')
  })
})

describe('readOptions', () => {
  it('defaults to 10 seconds, stars only, the server default filter and the effects on', () => {
    expect(readOptions('')).toEqual({ seconds: 10, ratings: false, filter: null, effects: true })
  })

  it('clamps seconds to 5 through 3600 and ignores a value that is not a number', () => {
    const seconds = (value) => readOptions(`?seconds=${value}`).seconds
    expect(seconds('2')).toBe(5)
    expect(seconds('30')).toBe(30)
    expect(seconds('7.5')).toBe(7.5)
    expect(seconds('99999')).toBe(3600)
    expect(seconds('abc')).toBe(10)
    expect(seconds('')).toBe(10)
    expect(seconds('Infinity')).toBe(10)
  })

  it('shows every rating only with ratings=all and passes on a known filter only', () => {
    expect(readOptions('?ratings=all').ratings).toBe(true)
    expect(readOptions('?ratings=stars').ratings).toBe(false)
    expect(readOptions('?filter=unread').filter).toBe('unread')
    expect(readOptions('?filter=wishlist').filter).toBeNull()
  })

  it('draws the cover effects unless effects=off', () => {
    expect(readOptions('?effects=off').effects).toBe(false)
    expect(readOptions('?effects=on').effects).toBe(true)
    expect(readOptions('?effects=').effects).toBe(true)
  })
})
