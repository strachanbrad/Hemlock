/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it } from 'vitest'
import { BOX_HEIGHT, CHILLI, EDGE, bloodMarkup, bloodOf, bulbOf, chilliLine, chilliMarkup, faceHeight, randomFrom, ratingLevel, seedOf } from '../src/pages/Display/effects.js'

const H = BOX_HEIGHT
const SEEDS = Array.from({ length: 40 }, (_, i) => seedOf(i + 1))
const SIDES = ['left', 'right']
const onSide = (blood, side) => blood.drips.filter((drip) => drip.side === side)
const longest = (blood, side) => Math.max(...onSide(blood, side).map((drip) => drip.length))
const everySeed = (level, check) => SEEDS.forEach((seed) => check(bloodOf(level, seed, H)))

describe('ratingLevel and chilliLine', () => {
  it('clamps a rating to a whole level from 0 to 5 and reads anything else as 0', () => {
    expect([0, 1, 3, 5].map(ratingLevel)).toEqual([0, 1, 3, 5])
    expect(ratingLevel(7)).toBe(5)
    expect(ratingLevel(-2)).toBe(0)
    expect(ratingLevel(2.6)).toBe(3)
    expect([null, undefined, 'x', NaN].map(ratingLevel)).toEqual([0, 0, 0, 0])
  })

  it('raises the level line of the chilli from the tip at spice 0 to the top at spice 5', () => {
    const lines = [0, 1, 2, 3, 4, 5].map(chilliLine)
    expect(lines[0]).toBe(CHILLI.tip)
    expect(lines[5]).toBe(CHILLI.top)
    lines.slice(1).forEach((line, i) => expect(line).toBeLessThan(lines[i]))
    expect(chilliLine(9)).toBe(CHILLI.top)
    expect(chilliLine(null)).toBe(CHILLI.tip)
  })
})

describe('faceHeight', () => {
  it('gives the face the proportions of the image, or of the box without them', () => {
    expect(faceHeight(200, 300)).toBe(150)
    expect(faceHeight(500, 500)).toBe(100)
    expect(faceHeight(300, 500)).toBeCloseTo(166.67, 2)
    expect(faceHeight(0, 0)).toBe(BOX_HEIGHT)
    expect(faceHeight(undefined, 400)).toBe(BOX_HEIGHT)
  })
})

describe('seedOf and randomFrom', () => {
  it('seeds a book the same way every time and differently from other books', () => {
    expect(seedOf(17)).toBe(seedOf(17))
    expect(seedOf(17)).toBe(seedOf('17'))
    expect(new Set(SEEDS).size).toBe(SEEDS.length)
  })

  it('yields the same sequence in [0, 1) from the same seed', () => {
    const a = randomFrom(seedOf(3))
    const b = randomFrom(seedOf(3))
    const values = Array.from({ length: 50 }, () => a())
    expect(Array.from({ length: 50 }, () => b())).toEqual(values)
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
  })
})

describe('bloodOf', () => {
  it('draws nothing at gore 0', () => {
    expect(bloodOf(0, SEEDS[0], H)).toBeNull()
    expect(bloodOf(null, SEEDS[0], H)).toBeNull()
  })

  it('draws the same pattern for a book every time and another pattern for another book', () => {
    expect(bloodOf(4, seedOf(9), H)).toEqual(bloodOf(4, seedOf(9), H))
    expect(bloodOf(4, seedOf(9), H)).not.toEqual(bloodOf(4, seedOf(10), H))
  })

  it('keeps every drip, its bulb and sway within EDGE of its side edge at every level', () => {
    for (let level = 1; level <= 5; level++) {
      everySeed(level, (blood) => {
        for (const drip of blood.drips) {
          expect(drip.x + bulbOf(drip.width).rx + Math.abs(drip.sway)).toBeLessThanOrEqual(EDGE + 1e-9)
          expect(drip.x).toBeGreaterThan(0)
        }
        for (const band of blood.bands) expect(band.length).toBeLessThanOrEqual(EDGE + 3)
      })
    }
  })

  it('puts two or three short drips at one top corner at gore 1', () => {
    everySeed(1, (blood) => {
      expect(blood.bands).toHaveLength(1)
      const { side } = blood.bands[0]
      expect(blood.drips.every((drip) => drip.side === side)).toBe(true)
      expect(blood.drips.length).toBeGreaterThanOrEqual(2)
      expect(blood.drips.length).toBeLessThanOrEqual(3)
      expect(longest(blood, side)).toBeLessThan(0.2 * H)
      expect(blood.pools).toEqual([])
    })
    expect(new Set(SEEDS.map((seed) => bloodOf(1, seed, H).bands[0].side))).toEqual(new Set(SIDES))
  })

  it('puts short drips at both top corners at gore 2', () => {
    everySeed(2, (blood) => {
      expect(blood.bands.map((band) => band.side)).toEqual(SIDES)
      for (const side of SIDES) {
        expect(onSide(blood, side).length).toBeGreaterThanOrEqual(2)
        expect(longest(blood, side)).toBeLessThan(0.2 * H)
      }
    })
  })

  it('runs drips down both edges to about a third of the height at gore 3', () => {
    everySeed(3, (blood) => {
      for (const side of SIDES) {
        expect(longest(blood, side)).toBeGreaterThan(0.28 * H)
        expect(longest(blood, side)).toBeLessThan(0.37 * H)
      }
      expect(blood.drips.some((drip) => drip.heavy)).toBe(false)
    })
  })

  it('runs drips to about two thirds at gore 4, with a heavier run on each edge', () => {
    everySeed(4, (blood) => {
      for (const side of SIDES) {
        expect(longest(blood, side)).toBeGreaterThan(0.55 * H)
        expect(longest(blood, side)).toBeLessThan(0.7 * H)
      }
      const heavy = blood.drips.filter((drip) => drip.heavy)
      const thin = Math.max(...blood.drips.filter((drip) => !drip.heavy).map((drip) => drip.width))
      expect(heavy.map((drip) => drip.side)).toEqual(SIDES)
      expect(heavy.every((drip) => drip.width > thin)).toBe(true)
      expect(blood.pools).toEqual([])
    })
  })

  it('runs most of the way down both edges into pools at the bottom corners at gore 5', () => {
    everySeed(5, (blood) => {
      expect(blood.pools.map((pool) => pool.side)).toEqual(SIDES)
      for (const pool of blood.pools) {
        const pooled = onSide(blood, pool.side).filter((drip) => drip.pooled)
        expect(pooled).toHaveLength(1)
        expect(pooled[0].length).toBe(longest(blood, pool.side))
        expect(pooled[0].length).toBeGreaterThan(H - pool.height)
        expect(pool.width).toBeLessThanOrEqual(EDGE)
      }
      expect(blood.drips.filter((drip) => drip.heavy)).toHaveLength(4)
    })
  })

  it('measures the runs against the face height', () => {
    const tall = bloodOf(3, SEEDS[5], 150)
    const square = bloodOf(3, SEEDS[5], 100)
    expect(longest(square, 'left') / 100).toBeCloseTo(longest(tall, 'left') / 150, 6)
  })
})

describe('bloodMarkup and chilliMarkup', () => {
  const count = (markup, text) => markup.split(text).length - 1

  it('draw nothing at level 0', () => {
    expect(bloodMarkup(7, 0, H)).toBeNull()
    expect(chilliMarkup(0, H, 'c')).toBeNull()
  })

  it('draws every band, drip and pool in the rim and the body, and a glint on each drip that does not pool', () => {
    for (const level of [1, 3, 5]) {
      const blood = bloodOf(level, seedOf(7), H)
      const { markup } = bloodMarkup(7, level, H)
      const drawn = blood.bands.length + 2 * blood.drips.length + blood.pools.length
      const [rim, body] = markup.split('class="display-blood-body"')
      expect(count(rim, '<path')).toBe(drawn)
      expect(count(body.split('class="display-blood-shine"')[0], '<path')).toBe(drawn)
      expect(count(markup, 'display-blood-glint')).toBe(blood.drips.filter((drip) => !drip.pooled).length)
      expect(count(markup, 'class="display-blood-pool"')).toBe(2 * blood.pools.length)
    }
  })

  it('names the chilli gradient and clips with the ids given, and draws the level line below spice 5', () => {
    const { level, markup } = chilliMarkup(3, H, 'x1')
    expect(level).toBe(3)
    expect(markup).toContain('id="x1-heat"')
    expect(markup).toContain('clip-path="url(#x1-fill)"')
    expect(markup).toContain(`y1="${chilliLine(3)}"`)
    expect(chilliMarkup(5, H, 'x1').markup).not.toContain('display-chilli-level')
  })
})
