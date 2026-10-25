/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_MOMENTUM, MAX_SIDE, WHEEL_INTERVAL, WHEEL_START, WHEEL_THRESHOLD, centreIndex, coverPose, dragPosition, flowGeometry,
  keyTarget, outerEdge, poseTransform, releaseTarget, stepIndex, storeView, storedView, visibleRange, wheelDelta, wheelStep,
} from '../src/pages/Library/coverflow.js'

describe('flowGeometry', () => {
  it('fits every visible cover inside the stage, at phone, tablet and desktop widths', () => {
    for (const width of [320, 390, 520, 768, 1192, 1440, 2560]) {
      const g = flowGeometry(width)
      expect(outerEdge(g.side, g)).toBeLessThanOrEqual(width / 2)
      expect(g.side).toBeGreaterThanOrEqual(1)
      expect(g.side).toBeLessThanOrEqual(MAX_SIDE)
    }
  })

  it('shows two covers a side on a phone, the centre one about 55% of the width', () => {
    const g = flowGeometry(390)
    expect(g.side).toBe(2)
    expect(g.cover / 390).toBeCloseTo(0.55, 2)
  })

  it('shows more covers on a desktop and caps the cover size', () => {
    const g = flowGeometry(1192)
    expect(g.side).toBeGreaterThanOrEqual(4)
    expect(g.cover).toBe(240)
  })

  it('shrinks the covers in a short window, so the caption stays in view', () => {
    const short = flowGeometry(1192, 720)
    expect(short.cover).toBeLessThan(240)
    expect(short.cover * 1.95 + 400).toBeLessThanOrEqual(720)
    expect(outerEdge(short.side, short)).toBeLessThanOrEqual(1192 / 2)
    expect(flowGeometry(1192, 300).cover).toBe(120)
  })

  it('keeps a phone centre cover at least 42% of the width in a short window', () => {
    expect(flowGeometry(390, 664).cover / 390).toBeGreaterThanOrEqual(0.42)
    expect(flowGeometry(390, 664).side).toBeLessThanOrEqual(3)
  })

  it('treats an unmeasured stage as the narrowest one', () => {
    expect(flowGeometry(0)).toEqual(flowGeometry(320))
  })
})

describe('coverPose', () => {
  const g = flowGeometry(1192)

  it('faces the centre cover to the viewer at full size, on top', () => {
    const pose = coverPose(0, g)
    expect(pose).toMatchObject({ x: 0, z: 0, rotate: 0, scale: 1, opacity: 1 })
    expect(pose.zIndex).toBeGreaterThan(coverPose(1, g).zIndex)
  })

  it('turns side covers toward the centre, mirrored left and right, and pushes them back', () => {
    const right = coverPose(2, g)
    const left = coverPose(-2, g)
    expect(right.x).toBeCloseTo(g.gap + g.spacing)
    expect(right.rotate).toBeCloseTo(-g.angle)
    expect(right.rotate).toBeGreaterThanOrEqual(-65)
    expect(right.rotate).toBeLessThanOrEqual(-55)
    expect(right.scale).toBeLessThan(1)
    expect(right.z).toBeLessThan(0)
    expect(left).toMatchObject({ x: -right.x, rotate: -right.rotate, scale: right.scale, z: right.z })
  })

  it('moves continuously between slots, so a drag follows the finger', () => {
    const half = coverPose(0.5, g)
    expect(half.x).toBeCloseTo(g.gap / 2)
    expect(half.rotate).toBeCloseTo(-g.angle / 2)
    expect(coverPose(1.5, g).x).toBeCloseTo(g.gap + g.spacing / 2)
  })

  it('parks a cover past the last slot on it, faded out and beneath', () => {
    const last = coverPose(g.side, g)
    const parked = coverPose(g.side + 1, g)
    expect(parked.x).toBeCloseTo(last.x)
    expect(last.opacity).toBe(1)
    expect(parked.opacity).toBe(0)
    expect(coverPose(g.side + 0.5, g).opacity).toBeCloseTo(0.5)
    expect(parked.zIndex).toBeLessThan(last.zIndex)
  })

  it('writes the pose as a GPU transform', () => {
    expect(poseTransform({ x: 10, z: -5, rotate: -60, scale: 0.85 })).toBe('translate3d(10.0px, 0, -5.0px) rotateY(-60.00deg) scale(0.850)')
  })
})

describe('visibleRange', () => {
  it('holds the visible covers and one parked cover each side', () => {
    expect(visibleRange(10, 5, 2000)).toEqual([4, 16])
  })

  it('stops at the ends of the list', () => {
    expect(visibleRange(0, 5, 23)).toEqual([0, 6])
    expect(visibleRange(22, 5, 23)).toEqual([16, 22])
    expect(visibleRange(0, 2, 1)).toEqual([0, 0])
    expect(visibleRange(0, 2, 0)).toEqual([0, -1])
  })

  it('never mounts more than 2 * MAX_SIDE + 3 covers, whatever the list size', () => {
    const [from, to] = visibleRange(1000.4, MAX_SIDE, 2000)
    expect(to - from + 1).toBeLessThanOrEqual(2 * MAX_SIDE + 3)
  })
})

describe('steps and keys', () => {
  it('clamps a step to the list', () => {
    expect(stepIndex(0, -1, 5)).toBe(0)
    expect(stepIndex(4, 1, 5)).toBe(4)
    expect(stepIndex(2, 1, 5)).toBe(3)
    expect(stepIndex(0, 1, 0)).toBe(0)
  })

  it('maps the arrow keys, Home and End, and ignores the rest', () => {
    expect(keyTarget('ArrowRight', 2, 5)).toBe(3)
    expect(keyTarget('ArrowLeft', 2, 5)).toBe(1)
    expect(keyTarget('ArrowLeft', 0, 5)).toBe(0)
    expect(keyTarget('Home', 3, 5)).toBe(0)
    expect(keyTarget('End', 1, 5)).toBe(4)
    expect(keyTarget('a', 1, 5)).toBeNull()
    expect(keyTarget('ArrowRight', 0, 0)).toBeNull()
  })
})

describe('centreIndex', () => {
  const list = (...ids) => ids.map((id) => ({ id }))

  it('follows the centred book through a new list', () => {
    expect(centreIndex(list(1, 2, 3, 4), { id: 3, index: 2 })).toBe(2)
    expect(centreIndex(list(3, 4), { id: 3, index: 2 })).toBe(0)
    expect(centreIndex(list(9, 8, 7, 3), { id: 3, index: 0 })).toBe(3)
  })

  it('clamps the old index when the book is gone', () => {
    expect(centreIndex(list(1, 2, 4, 5, 6), { id: 3, index: 2 })).toBe(2)
    expect(centreIndex(list(1, 2), { id: 9, index: 7 })).toBe(1)
    expect(centreIndex([], { id: 9, index: 7 })).toBe(0)
    expect(centreIndex(list(1, 2), { id: null, index: 0 })).toBe(0)
  })
})

describe('drag and release', () => {
  it('moves one position per step of drag, against the drag direction, within the list', () => {
    expect(dragPosition(3, -100, 100, 10)).toBe(4)
    expect(dragPosition(3, 50, 100, 10)).toBe(2.5)
    expect(dragPosition(0, 500, 100, 10)).toBe(0)
    expect(dragPosition(9, -500, 100, 10)).toBe(9)
  })

  it('snaps to the nearest book when released still', () => {
    expect(releaseTarget(3.4, 0, 10)).toBe(3)
    expect(releaseTarget(3.6, 0, 10)).toBe(4)
  })

  it('adds momentum from a flick, at most a few steps, within the list', () => {
    expect(releaseTarget(3, 0.01, 20)).toBe(5)
    expect(releaseTarget(3, 10, 20)).toBe(3 + MAX_MOMENTUM)
    expect(releaseTarget(3, -10, 20)).toBe(0)
    expect(releaseTarget(18, 10, 20)).toBe(19)
  })
})

describe('wheel', () => {
  it('takes the larger axis and turns lines and pages into pixels', () => {
    expect(wheelDelta({ deltaMode: 0, deltaX: 0, deltaY: 100 })).toBe(100)
    expect(wheelDelta({ deltaMode: 0, deltaX: -60, deltaY: 4 })).toBe(-60)
    expect(wheelDelta({ deltaMode: 1, deltaX: 0, deltaY: 3 })).toBe(120)
    expect(wheelDelta({ deltaMode: 2, deltaX: 0, deltaY: -1 })).toBeLessThan(-WHEEL_THRESHOLD)
  })

  const run = (events) => {
    let state = WHEEL_START
    return events.map(([delta, at]) => {
      const result = wheelStep(state, delta, at)
      state = result.state
      return result.step
    })
  }

  it('steps once per notch, however large the notch', () => {
    expect(run([[100, 0], [120, 300], [-500, 600]])).toEqual([1, 1, -1])
  })

  it('adds up a trackpad stream of small deltas into steps', () => {
    const stream = Array.from({ length: 12 }, (_, i) => [10, i * 16])
    const steps = run(stream)
    expect(steps.filter(Boolean).length).toBe(2)
    expect(steps.every((step) => step >= 0)).toBe(true)
  })

  it('never steps twice within the interval', () => {
    expect(run([[200, 0], [200, WHEEL_INTERVAL - 1], [200, WHEEL_INTERVAL + 10]])).toEqual([1, 0, 1])
  })

  it('forgets a partial sum after a pause', () => {
    expect(run([[30, 0], [30, 1000]])).toEqual([0, 0])
  })
})

describe('the remembered view', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('defaults to the list and remembers the flow', () => {
    expect(storedView()).toBe('list')
    storeView('flow')
    expect(storedView()).toBe('flow')
    storeView('list')
    expect(storedView()).toBe('list')
  })

  it('works without storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => storeView('flow')).not.toThrow()
    expect(storedView()).toBe('list')
  })
})
