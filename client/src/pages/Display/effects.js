/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Effect coordinates: the cover's face is FACE_WIDTH units wide and faceHeight() units tall.
export const FACE_WIDTH = 100
// Matches the 2:3 .display-cover in display.css.
export const BOX_HEIGHT = 150
// Every drip, its bulb and sway included, stays within EDGE units of its side edge.
export const EDGE = 12

export function ratingLevel(value) {
  const level = Math.round(Number(value))
  return Number.isFinite(level) ? Math.min(5, Math.max(0, level)) : 0
}

export function faceHeight(naturalWidth, naturalHeight) {
  return naturalWidth > 0 && naturalHeight > 0 ? (FACE_WIDTH * naturalHeight) / naturalWidth : BOX_HEIGHT
}

export function seedOf(id) {
  let hash = 2166136261
  for (const char of String(id)) hash = Math.imul(hash ^ char.codePointAt(0), 16777619)
  return hash >>> 0
}

export function randomFrom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// runs: drip lengths per corner as fractions of the face height, longest first; the first `least` always show.
const GORE = [
  null,
  { corners: 1, band: 11, thickness: 1.9, runs: [[0.15, 0.19], [0.04, 0.08], [0.03, 0.06]], least: 2, heavy: 0 },
  { corners: 2, band: 11, thickness: 2, runs: [[0.15, 0.19], [0.05, 0.1], [0.03, 0.06]], least: 2, heavy: 0 },
  { corners: 2, band: 11.5, thickness: 2.3, runs: [[0.31, 0.36], [0.12, 0.2], [0.04, 0.08]], least: 3, heavy: 0 },
  { corners: 2, band: 12.5, thickness: 2.7, runs: [[0.62, 0.68], [0.25, 0.4], [0.05, 0.1], [0.03, 0.07]], least: 3, heavy: 1 },
  { corners: 2, band: 13.5, thickness: 3.1, runs: [[1, 1], [0.55, 0.75], [0.15, 0.3], [0.04, 0.09]], least: 4, heavy: 2 },
]

const POOL_LEVEL = 5

export const bulbOf = (width) => ({ rx: width * 0.5, ry: width * 0.62 })
const WOBBLE = 10

function cornerOf(level, side, random, height) {
  const spec = GORE[level]
  const between = (low, high) => low + random() * (high - low)
  const length = spec.band * between(0.92, 1.08)
  const thickness = spec.thickness * between(0.9, 1.1)
  const pool = level >= POOL_LEVEL ? { side, width: between(6.5, 8), height: height * between(0.03, 0.04) } : null
  const count = spec.least + Math.floor(random() * (spec.runs.length - spec.least + 1))

  const slots = [...Array(count).keys()]
  for (let i = count - 1; i > 1; i--) {
    const j = 1 + Math.floor(random() * i)
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }

  const start = 2
  const slot = (Math.min(EDGE, length - 1.2) - start) / count
  const drips = spec.runs.slice(0, count).map(([low, high], rank) => {
    const heavy = rank < spec.heavy
    const width = heavy ? between(3, 3.4) : between(1.3, 1.7)
    const pooled = rank === 0 && pool !== null
    const run = pooled ? height - pool.height * 0.3 : between(low, high) * height
    const sway = pooled ? between(1, 1.8) : between(-0.4, 0.4) * Math.min(1, run / 25)
    const room = bulbOf(width).rx + Math.abs(sway)
    const x = Math.min(EDGE - room, start + slot * (slots[rank] + between(0.25, 0.75)))
    const delay = between(0, 0.5)
    const wobble = Array.from({ length: WOBBLE }, () => between(-1, 1))
    const swell = pooled ? between(0.4, 0.6) : null
    return { side, x, width, length: run, sway, heavy, pooled, swell, wobble, delay, duration: 1.2 + 2.2 * (run / height) }
  })
  if (pool) pool.delay = drips[0].delay + drips[0].duration * 0.55

  const taper = (x) => 1 - 0.45 * Math.min(1, x / length) ** 1.5
  const edge = [[length, -0.3]]
  let previous = length
  for (const x of drips.map((drip) => drip.x).sort((a, b) => b - a)) {
    const rise = (previous + x) / 2
    if (previous - x > 1.2) edge.push([rise, thickness * between(0.45, 0.7) * taper(rise)])
    edge.push([x, thickness * between(1, 1.2) * taper(x)])
    previous = x
  }
  edge.push([previous / 2, thickness * between(0.6, 0.85)], [-1, thickness * between(1.15, 1.35)])

  return { band: { side, length, thickness, edge }, drips, pool }
}

export function bloodOf(gore, seed, height) {
  const level = ratingLevel(gore)
  if (level === 0) return null
  const random = randomFrom(seed)
  const sides = GORE[level].corners === 2 ? ['left', 'right'] : [random() < 0.5 ? 'left' : 'right']
  const corners = sides.map((side) => cornerOf(level, side, randomFrom(seed ^ (side === 'left' ? 0x9e3779b9 : 0x85ebca6b)), height))
  return {
    level,
    height,
    bands: corners.map((corner) => corner.band),
    drips: corners.flatMap((corner) => corner.drips),
    pools: corners.map((corner) => corner.pool).filter(Boolean),
  }
}

// The chilli is drawn in a 40 by 64 box. lines[spice] is the height with spice / 5 of the pod's area that the
// calyx leaves visible below it, measured from pod and calyx in a browser; measure again when either changes.
export const CHILLI = {
  pod: 'M15 15C12.5 17 12 24 12.5 31C13 40 11.5 50 8.5 58C7.8 60 8.6 61.6 10 60.6C17 55 24 46 28 35C30.5 28 31.5 21 30 16.5C28 13.5 18 13 15 15Z',
  calyx: 'M13.5 16C15 11.5 29 11 31.5 16.5C28.5 14.8 25 15.8 22.5 14.5C20 15.8 16.5 14.8 13.5 16Z',
  stem: 'M21.5 12.6C21.5 8 23.5 4.5 28 2.5L29 3.8C25.5 5.5 23.8 8.5 23.8 12.6Z',
  shine: 'M15.4 19C14.6 25 15 33 14.8 40',
  top: 13,
  tip: 61.6,
  lines: [61.6, 44.8, 35.9, 28.7, 22.1, 13],
}

export const chilliLine = (spice) => CHILLI.lines[ratingLevel(spice)]

const round = (value) => Math.round(value * 100) / 100
const sideX = (side, x) => (side === 'left' ? x : FACE_WIDTH - x)
const path = (parts) => parts.map((part) => (typeof part === 'number' ? round(part) : part)).join(' ')

// Catmull-Rom through the points as cubic segments; the path must already be at the first point.
function smooth(points) {
  const parts = []
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b, c, d] = [points[Math.max(0, i - 1)], points[i], points[i + 1], points[Math.min(points.length - 1, i + 2)]]
    parts.push('C', b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1])
  }
  return parts
}

export function bandPath({ side, length, edge }) {
  const points = edge.map(([x, y]) => [sideX(side, x), y])
  return path(['M', sideX(side, -1), -1, 'L', sideX(side, length + 0.5), -1, 'L', ...points[0], ...smooth(points), 'Z'])
}

// The trail ends at the bulb's centre, so the bulb covers its end at every point of the run.
export function dripGeometry({ side, x, width, length, sway, heavy, swell, wobble }) {
  const { rx, ry } = bulbOf(width)
  const cx = sideX(side, x)
  const ex = cx + (side === 'left' ? sway : -sway)
  const centre = length - ry
  const flare = Math.min(heavy ? 4.5 : 3, centre * 0.3)
  const fillet = width * (heavy ? 1.1 : 1.4)
  const neck = width * 0.52
  const tail = width * (heavy ? 0.2 : 0.25)
  const taper = heavy ? 0.5 : 0.75
  const steps = Math.min(WOBBLE - 1, Math.max(2, Math.round((centre - flare) / (swell === null ? 12 : 8))))
  const spine = Array.from({ length: steps + 1 }, (_, j) => {
    const t = j / steps
    const bow = 4 * t * (1 - t)
    const centreX = cx + (ex - cx) * t * t * (3 - 2 * t) + wobble[j] * 0.6 * bow * Math.min(1, centre / 40)
    const bead = swell === null ? 0 : 0.6 * Math.exp(-(((t - swell) / 0.07) ** 2))
    const half = (neck + (tail - neck) * t ** taper) * (1 + wobble[WOBBLE - 1 - j] * 0.15 * bow + bead)
    return { x: centreX, y: flare + (centre - flare) * t, half }
  })
  const left = spine.map((point) => [point.x - point.half, point.y])
  const right = spine.map((point) => [point.x + point.half, point.y]).reverse()
  const trail = path(['M', cx - fillet, -1, 'C', cx - neck * 1.3, -0.6, left[0][0], flare * 0.45, ...left[0], ...smooth(left),
    'L', ...right[0], ...smooth(right), 'C', right[steps][0], flare * 0.45, cx + neck * 1.3, -0.6, cx + fillet, -1, 'Z'])
  const tip = centre - 3 * ry
  const bulb = path(['M', ex - tail, tip, 'C', ex - tail, centre - 1.8 * ry, ex - rx, centre - 1.1 * ry, ex - rx, centre,
    'A', rx, ry, 0, 0, 0, ex + rx, centre, 'C', ex + rx, centre - 1.1 * ry, ex + tail, centre - 1.8 * ry, ex + tail, tip, 'Z'])
  const streak = heavy ? path(['M', cx - neck * 0.4, flare * 0.6, 'L', cx - neck * 0.35, flare + 4]) : null
  const angle = (degrees) => (degrees * Math.PI) / 180
  const onBulb = (degrees) => [ex + 0.62 * rx * Math.cos(angle(degrees)), centre + 0.62 * ry * Math.sin(angle(degrees))]
  return {
    trail,
    bulb,
    streak,
    streakWidth: round(neck * 0.4),
    glint: path(['M', ...onBulb(195), 'A', 0.62 * rx, 0.62 * ry, 0, 0, 1, ...onBulb(260)]),
    glintWidth: round(width * 0.14),
    run: round(Math.max(0, tip)),
  }
}

export function poolPath({ side, width, height: depth }, height) {
  const x = (value) => sideX(side, value)
  return path(['M', x(-1), height + 1, 'L', x(width), height + 1, 'C', x(width * 0.95), height - depth * 0.2, x(width * 0.8), height - depth * 0.75,
    x(width * 0.55), height - depth * 0.85, 'S', x(width * 0.15), height - depth, x(-1), height - depth * 1.05, 'Z'])
}

// ── markup ────────────────────────────────────────────────
// The SVG inside each effect's outer svg, with the classes display.css styles and the timing as custom
// properties. CoverEffects renders it on the page; roku/scripts/images.js draws its finished frame for the TV.

const style = (vars) => Object.entries(vars).map(([name, value]) => `${name}:${value}`).join(';')

export function bloodMarkup(id, gore, height) {
  const blood = bloodOf(gore, seedOf(id), height)
  if (!blood) return null
  const drips = blood.drips.map((drip) => ({ drip, shape: dripGeometry(drip) }))
  const timing = (drip) => ({ '--delay': `${drip.delay}s`, '--duration': `${drip.duration}s` })
  const fall = (drip, shape) => style({ ...timing(drip), '--from': `${-shape.run}px` })
  const shapes = [
    ...blood.bands.map((band) => `<path class="display-blood-band" d="${bandPath(band)}"/>`),
    ...drips.map(({ drip, shape }) => `<path class="display-blood-trail" d="${shape.trail}" style="${style(timing(drip))}"/>`),
    ...drips.map(({ drip, shape }) => `<path class="display-blood-bulb" d="${shape.bulb}" style="${fall(drip, shape)}"/>`),
    ...blood.pools.map((pool) => `<path class="display-blood-pool" d="${poolPath(pool, height)}" style="${style({ '--delay': `${pool.delay}s`, '--from': `${pool.height * 1.2}px` })}"/>`),
  ].join('')
  const shine = [
    ...drips.filter(({ shape }) => shape.streak).map(({ drip, shape }) =>
      `<path class="display-blood-trail" d="${shape.streak}" stroke-width="${shape.streakWidth}" style="${style(timing(drip))}"/>`),
    ...drips.filter(({ drip }) => !drip.pooled).map(({ drip, shape }) =>
      `<path class="display-blood-bulb display-blood-glint" d="${shape.glint}" stroke-width="${shape.glintWidth}" style="${fall(drip, shape)}"/>`),
  ].join('')
  return {
    level: blood.level,
    markup: `<svg width="${FACE_WIDTH}" height="${height}"><g class="display-blood-rim">${shapes}</g><g class="display-blood-body">${shapes}</g><g class="display-blood-shine">${shine}</g></svg>`,
  }
}

// In effect units: the chilli's box in the face's bottom right corner.
export const CHILLI_BOX = { width: 11, height: 17.6, margin: 2.5 }

// The fill rises by moving its clip window up while the gradient inside moves down by as much, so the gradient
// stays still and the level only uncovers it. `ids` prefixes the gradient and clip ids, unique on the page.
export function chilliMarkup(spice, height, ids) {
  const level = ratingLevel(spice)
  if (level === 0) return null
  const line = chilliLine(level)
  const drop = CHILLI.tip - line
  const { width, height: boxHeight, margin } = CHILLI_BOX
  const levelLine = level < 5
    ? `<line class="display-chilli-rise display-chilli-level" x1="0" y1="${line}" x2="40" y2="${line}" style="--from:${drop}px"/>`
    : ''
  return {
    level,
    markup: `<svg x="${FACE_WIDTH - margin - width}" y="${height - margin - boxHeight}" width="${width}" height="${boxHeight}" viewBox="0 0 40 64">`
      + '<defs>'
      + `<linearGradient id="${ids}-heat" gradientUnits="userSpaceOnUse" x1="0" y1="${CHILLI.tip}" x2="0" y2="${CHILLI.top}">`
      + '<stop offset="0" class="display-chilli-amber"/><stop offset="0.45" class="display-chilli-orange"/><stop offset="1" class="display-chilli-red"/>'
      + '</linearGradient>'
      + `<clipPath id="${ids}-pod"><path d="${CHILLI.pod}"/></clipPath>`
      + `<clipPath id="${ids}-fill"><rect x="0" y="${line}" width="40" height="${64 - line}"/></clipPath>`
      + '</defs>'
      + `<g class="display-chilli-halo"><path d="${CHILLI.pod}"/><path d="${CHILLI.calyx}"/><path d="${CHILLI.stem}"/></g>`
      + `<g clip-path="url(#${ids}-pod)">`
      + '<rect class="display-chilli-wash" x="0" y="0" width="40" height="64"/>'
      + `<g class="display-chilli-rise" clip-path="url(#${ids}-fill)" style="--from:${drop}px">`
      + `<rect class="display-chilli-rise" x="0" y="0" width="40" height="64" fill="url(#${ids}-heat)" style="--from:${-drop}px"/>`
      + '</g>'
      + levelLine
      + '</g>'
      + `<path class="display-chilli-shine" d="${CHILLI.shine}"/>`
      + `<path class="display-chilli-pod" d="${CHILLI.pod}"/>`
      + `<path class="display-chilli-stem" d="${CHILLI.calyx}"/>`
      + `<path class="display-chilli-stem" d="${CHILLI.stem}"/>`
      + '</svg>',
  }
}
