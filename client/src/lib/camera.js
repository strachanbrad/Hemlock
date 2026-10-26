/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

// iOS's physical main lens; its virtual cameras (Dual, Dual Wide, Triple) switch lens on their own.
const MAIN_LENS = 'Back Camera'
const BACK = /\b(back|rear)\b|environment/i
const NOT_MAIN = /ultra|dual|triple|telephoto/i

// Labels are empty until the page has camera permission, so this answers null before the first open.
export function chooseLens(devices) {
  const cameras = devices.filter((device) => device.kind === 'videoinput')
  return (
    cameras.find((device) => device.label === MAIN_LENS) ??
    cameras.find((device) => BACK.test(device.label) && !NOT_MAIN.test(device.label)) ??
    null
  )
}

const SIZE = { width: { ideal: 1920 }, height: { ideal: 1080 } }

export function videoConstraints(deviceId) {
  return deviceId ? { deviceId: { exact: deviceId }, ...SIZE } : { facingMode: { ideal: 'environment' }, ...SIZE }
}

// The track's zoom capability as a factor (1 is the lens's own view), clamped to its range and rounded
// to its step; null when the camera offers none. A desktop webcam's device units (100 to 500, say)
// count as none.
export function zoomLevel(capability, factor) {
  if (!(capability?.min <= 1 && capability.max > 1)) return null
  const { min, max, step } = capability
  let level = Math.min(factor, max)
  if (step > 0) {
    level = min + Math.round((level - min) / step) * step
    // The nearest step can lie one step past the maximum; float noise past it is not a step.
    if (level - max > 1e-6) level -= step
  }
  return Math.round(level * 1e6) / 1e6
}

// applyConstraints replaces every constraint the track has, so the size goes with the zoom. A plain
// zoom constraint goes first and, when it is refused or does not take, an advanced one.
export async function applyZoom(track, zoom) {
  for (const constraints of [{ ...SIZE, zoom }, { ...SIZE, advanced: [{ zoom }] }]) {
    try {
      await track.applyConstraints(constraints)
      if (Math.abs((track.getSettings().zoom ?? zoom) - zoom) < 0.01) return true
    } catch {
      // Refused: the advanced form next, or no zoom.
    }
  }
  return false
}

// The middle 40 percent of the preview's height. BarcodeScanner.css insets the guide box 30 percent
// from the top and the bottom to match.
const BAND = 0.4

// The band in the frame's own pixels. The preview (object-fit: cover) shows a centred crop of the
// frame, so the band is cut from that crop; a view with no size counts as showing the whole frame.
export function bandRect(frameWidth, frameHeight, viewWidth, viewHeight) {
  if (!frameWidth || !frameHeight) return null
  const [w, h] = viewWidth && viewHeight ? [viewWidth, viewHeight] : [frameWidth, frameHeight]
  const scale = Math.max(w / frameWidth, h / frameHeight)
  const width = Math.round(w / scale)
  const height = Math.round((h / scale) * BAND)
  return { x: Math.round((frameWidth - width) / 2), y: Math.round((frameHeight - height) / 2), width, height }
}
