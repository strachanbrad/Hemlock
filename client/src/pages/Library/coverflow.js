/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

export const MAX_SIDE = 7
export const MAX_MOMENTUM = 3
export const DRAG_THRESHOLD = 6
export const WHEEL_THRESHOLD = 40
export const WHEEL_INTERVAL = 70
export const WHEEL_GESTURE_GAP = 250
const MOMENTUM_MS = 160
const EDGE_MARGIN = 6
const LINE_PX = 40
const MIN_COVER = 120
const MAX_COVER = 240
// The stage is at most 1.95 cover widths tall (coverflow.css) and the rest of the page takes about
// 400px, so a short window gets smaller covers rather than a caption below the fold; a phone keeps
// its centre cover at least 42% of the width and scrolls instead.
const STAGE_RATIO = 1.95
const PAGE_CHROME = 400

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const lerp = (from, to, t) => from + (to - from) * t
const radians = (degrees) => (degrees * Math.PI) / 180

// A narrow stage tucks its side covers behind the centre one and shows at most two a side.
function shape(width, height) {
  const t = clamp((width - 390) / (1100 - 390), 0, 1)
  const fitHeight = Math.max(MIN_COVER, lerp(0.42, 0, t) * width, (height - PAGE_CHROME) / STAGE_RATIO)
  const cover = Math.round(Math.min(MAX_COVER, lerp(0.55, 0.4, t) * width, fitHeight))
  return {
    cover,
    gap: lerp(0.55, 0.92, t) * cover,
    spacing: lerp(0.11, 0.3, t) * cover,
    angle: lerp(62, 60, t),
    scale: lerp(0.8, 0.85, t),
    depth: -0.3 * cover,
    perspective: 3.5 * cover,
    maxSide: Math.round(lerp(2, MAX_SIDE, t)),
  }
}

const slotX = (n, g) => (n === 0 ? 0 : g.gap + (n - 1) * g.spacing)

// The screen x of a side cover's outer (nearest) edge after the perspective projection.
export function outerEdge(n, g) {
  const half = (g.cover / 2) * g.scale
  const x = slotX(n, g) + half * Math.cos(radians(g.angle))
  const z = g.depth + half * Math.sin(radians(g.angle))
  return (x * g.perspective) / (g.perspective - z)
}

export function flowGeometry(width, height = Infinity) {
  const w = Math.max(320, width || 0)
  const g = shape(w, height || Infinity)
  let side = 1
  while (side < g.maxSide && outerEdge(side + 1, g) <= w / 2 - EDGE_MARGIN) side += 1
  return { ...g, width: w, side, step: g.cover / 2 }
}

// A cover between slots moves, turns and fades continuously, so a drag can follow the finger.
// Past the last slot a cover stays on it and fades out, so nothing leaves the stage.
export function coverPose(offset, g) {
  if (offset === 0) return { x: 0, z: 0, rotate: 0, scale: 1, opacity: 1, zIndex: 100 }
  const n = Math.abs(offset)
  const sign = Math.sign(offset)
  const t = Math.min(n, 1)
  const slot = Math.min(n, g.side)
  return {
    x: sign * (t * g.gap + Math.max(0, slot - 1) * g.spacing),
    z: t * g.depth,
    rotate: -sign * t * g.angle,
    scale: 1 - t * (1 - g.scale),
    opacity: clamp(g.side + 1 - n, 0, 1),
    zIndex: 100 - Math.round(n * 10),
  }
}

export const poseTransform = ({ x, z, rotate, scale }) =>
  `translate3d(${x.toFixed(1)}px, 0, ${z.toFixed(1)}px) rotateY(${rotate.toFixed(2)}deg) scale(${scale.toFixed(3)})`

// One parked, invisible cover each side of the visible ones, so a step fades it in.
export function visibleRange(position, side, count) {
  if (count === 0) return [0, -1]
  return [Math.max(0, Math.ceil(position - side - 1)), Math.min(count - 1, Math.floor(position + side + 1))]
}

export const stepIndex = (index, delta, count) => (count === 0 ? 0 : clamp(index + delta, 0, count - 1))

// The centre follows its book through a new list; when the book is gone, the old index is clamped.
export function centreIndex(books, centre) {
  if (books.length === 0) return 0
  const found = centre.id == null ? -1 : books.findIndex((book) => book.id === centre.id)
  return found >= 0 ? found : clamp(centre.index, 0, books.length - 1)
}

export function keyTarget(key, index, count) {
  if (count === 0) return null
  if (key === 'ArrowLeft') return stepIndex(index, -1, count)
  if (key === 'ArrowRight') return stepIndex(index, 1, count)
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

export const dragPosition = (startIndex, dx, step, count) => clamp(startIndex - dx / step, 0, Math.max(0, count - 1))

// velocity is in positions per millisecond; the momentum adds at most MAX_MOMENTUM steps.
export function releaseTarget(position, velocity, count) {
  const momentum = clamp(velocity * MOMENTUM_MS, -MAX_MOMENTUM, MAX_MOMENTUM)
  return stepIndex(Math.round(position + momentum), 0, count)
}

export function wheelDelta(event) {
  const unit = event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? 800 : 1
  const { deltaX, deltaY } = event
  return (Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY) * unit
}

export const WHEEL_START = { sum: 0, last: -Infinity, stepped: -Infinity }

// At most one step per event and per WHEEL_INTERVAL: a notch is one step, a trackpad's stream
// of small deltas adds up to steps, and a pause starts the sum afresh.
export function wheelStep(state, delta, now) {
  const sum = (now - state.last > WHEEL_GESTURE_GAP ? 0 : state.sum) + delta
  if (Math.abs(sum) >= WHEEL_THRESHOLD && now - state.stepped >= WHEEL_INTERVAL) {
    return { state: { sum: 0, last: now, stepped: now }, step: Math.sign(sum) }
  }
  return { state: { ...state, sum, last: now }, step: 0 }
}

const VIEW_KEY = 'hemlock.library.view'

// The remembered view is a convenience: storage can be missing or throw, and the list is the default.
export function storedView() {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'flow' ? 'flow' : 'list'
  } catch {
    return 'list'
  }
}

export function storeView(view) {
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {
    // nothing to do: the address still carries the choice
  }
}
