/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it, vi } from 'vitest'
import { applyZoom, bandRect, chooseLens, videoConstraints, zoomLevel } from '../src/lib/camera.js'

const camera = (deviceId, label) => ({ kind: 'videoinput', deviceId, label, groupId: '' })
const microphone = { kind: 'audioinput', deviceId: 'mic', label: 'iPhone Microphone', groupId: '' }

// enumerateDevices() on recent iPhones: the physical lenses and the virtual cameras built from them.
const IPHONE_15 = [
  camera('front', 'Front Camera'),
  camera('dual-wide', 'Back Dual Wide Camera'),
  camera('ultra-wide', 'Back Ultra Wide Camera'),
  camera('main', 'Back Camera'),
  microphone,
]
const IPHONE_16_PRO = [
  camera('triple', 'Back Triple Camera'),
  camera('dual', 'Back Dual Camera'),
  camera('telephoto', 'Back Telephoto Camera'),
  camera('front', 'Front Camera'),
  camera('dual-wide', 'Back Dual Wide Camera'),
  camera('ultra-wide', 'Back Ultra Wide Camera'),
  camera('main', 'Back Camera'),
  microphone,
]

describe('chooseLens', () => {
  it('picks the physical main lens of an iPhone, whatever the order', () => {
    expect(chooseLens(IPHONE_15).deviceId).toBe('main')
    expect(chooseLens([...IPHONE_15].reverse()).deviceId).toBe('main')
    expect(chooseLens(IPHONE_16_PRO).deviceId).toBe('main')
    expect(chooseLens([...IPHONE_16_PRO].reverse()).deviceId).toBe('main')
  })

  it('prefers the camera labelled exactly Back Camera to another back camera listed before it', () => {
    expect(chooseLens([camera('other', 'Back Depth Camera'), camera('main', 'Back Camera')]).deviceId).toBe('main')
  })

  it('picks the one back camera of a single-lens phone', () => {
    expect(chooseLens([camera('front', 'Front Camera'), camera('back', 'Back Camera')]).deviceId).toBe('back')
  })

  it('takes the first back camera that names no other lens when none is called Back Camera', () => {
    const android = [
      camera('a1', 'camera2 1, facing front'),
      camera('a0', 'camera2 0, facing back'),
      camera('a2', 'camera2 2, facing back'),
    ]
    expect(chooseLens(android).deviceId).toBe('a0')
    expect(chooseLens([camera('t', 'Rear Telephoto Camera'), camera('w', 'Rear Camera')]).deviceId).toBe('w')
  })

  it('answers null when only virtual or special back lenses are listed', () => {
    const lenses = ['Back Dual Wide Camera', 'Back Ultra Wide Camera', 'Back Triple Camera', 'Back Dual Camera', 'Back Telephoto Camera']
    expect(chooseLens(lenses.map((label, i) => camera(String(i), label)))).toBeNull()
  })

  it('answers null before permission, when every label is empty', () => {
    expect(chooseLens(IPHONE_16_PRO.map((device) => ({ ...device, label: '' })))).toBeNull()
  })

  it('answers null for a laptop camera and for no devices', () => {
    expect(chooseLens([camera('cam', 'Integrated Camera'), microphone])).toBeNull()
    expect(chooseLens([])).toBeNull()
  })

  it('ignores an audio input labelled like a back camera', () => {
    expect(chooseLens([{ ...microphone, label: 'Back Camera' }])).toBeNull()
  })
})

describe('videoConstraints', () => {
  it('asks for 1080p as an ideal, with the rear camera when no lens is chosen', () => {
    expect(videoConstraints(null)).toEqual({ facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } })
  })

  it('asks for exactly the chosen lens, without facingMode', () => {
    expect(videoConstraints('main')).toEqual({ deviceId: { exact: 'main' }, width: { ideal: 1920 }, height: { ideal: 1080 } })
  })
})

describe('bandRect', () => {
  it('cuts the middle 40 percent of a landscape frame cropped to a 4:3 preview', () => {
    expect(bandRect(1920, 1080, 480, 360)).toEqual({ x: 240, y: 324, width: 1440, height: 432 })
  })

  it('cuts it from a portrait frame, which the preview crops top and bottom', () => {
    expect(bandRect(1080, 1920, 480, 360)).toEqual({ x: 0, y: 798, width: 1080, height: 324 })
  })

  it('takes the whole frame when the frame and the preview have one shape', () => {
    expect(bandRect(640, 480, 320, 240)).toEqual({ x: 0, y: 144, width: 640, height: 192 })
  })

  it('takes the whole frame when the preview has no size', () => {
    expect(bandRect(1280, 720, 0, 0)).toEqual({ x: 0, y: 216, width: 1280, height: 288 })
  })

  it('answers null before the video has a size', () => {
    expect(bandRect(0, 0, 480, 360)).toBeNull()
  })
})

describe('zoomLevel', () => {
  const iphone = { min: 1, max: 10, step: 0.1 }

  it('answers the factor asked for within the camera’s zoom range', () => {
    expect(zoomLevel(iphone, 2)).toBe(2)
    expect(zoomLevel(iphone, 1)).toBe(1)
  })

  it('answers null when the camera offers no zoom', () => {
    expect(zoomLevel(undefined, 2)).toBeNull()
    expect(zoomLevel({ min: 1, max: 1, step: 0.1 }, 2)).toBeNull()
  })

  it('reads a desktop webcam’s device units as no zoom', () => {
    expect(zoomLevel({ min: 100, max: 500, step: 1 }, 2)).toBeNull()
  })

  it('clamps to a maximum below 2', () => {
    expect(zoomLevel({ min: 1, max: 1.5, step: 0.1 }, 2)).toBe(1.5)
    expect(zoomLevel({ min: 1, max: 1.5 }, 2)).toBe(1.5)
  })

  it('rounds to the camera’s step, never past its maximum', () => {
    expect(zoomLevel({ min: 1, max: 5, step: 0.3 }, 2)).toBe(1.9)
    expect(zoomLevel({ min: 1, max: 5, step: 0.6 }, 2)).toBe(2.2)
    expect(zoomLevel({ min: 1, max: 1.96, step: 0.1 }, 2)).toBe(1.9)
    expect(zoomLevel({ min: 0.5, max: 1.7, step: 0.1 }, 2)).toBe(1.7)
    expect(zoomLevel({ min: 0.5, max: 4, step: 0.25 }, 2)).toBe(2)
    expect(zoomLevel({ min: 1, max: 4 }, 2)).toBe(2)
  })

  it('keeps a factor of 1 for a range that starts below it', () => {
    expect(zoomLevel({ min: 0.5, max: 6, step: 0.1 }, 1)).toBe(1)
  })
})

describe('applyZoom', () => {
  const size = { width: { ideal: 1920 }, height: { ideal: 1080 } }

  // A track whose settings take the zoom it is given, unless `refuse` says which forms it refuses or ignores.
  function fakeTrack({ refuse = [], ignore = [], reports = true } = {}) {
    const settings = { zoom: 1 }
    const track = {
      getSettings: () => (reports ? settings : {}),
      applyConstraints: vi.fn(async (constraints) => {
        const form = constraints.advanced ? 'advanced' : 'plain'
        if (refuse.includes(form)) throw new DOMException('no', 'OverconstrainedError')
        if (!ignore.includes(form)) settings.zoom = constraints.zoom ?? constraints.advanced[0].zoom
      }),
    }
    return track
  }

  it('sends the zoom as a plain constraint with the size', async () => {
    const track = fakeTrack()
    expect(await applyZoom(track, 2)).toBe(true)
    expect(track.applyConstraints.mock.calls).toEqual([[{ ...size, zoom: 2 }]])
  })

  it('sends it as an advanced constraint when the plain one is refused', async () => {
    const track = fakeTrack({ refuse: ['plain'] })
    expect(await applyZoom(track, 2)).toBe(true)
    expect(track.applyConstraints.mock.calls).toEqual([[{ ...size, zoom: 2 }], [{ ...size, advanced: [{ zoom: 2 }] }]])
  })

  it('sends it as an advanced constraint when the plain one does not take', async () => {
    const track = fakeTrack({ ignore: ['plain'] })
    expect(await applyZoom(track, 2)).toBe(true)
    expect(track.applyConstraints).toHaveBeenCalledTimes(2)
  })

  it('answers false when both forms are refused or do not take', async () => {
    expect(await applyZoom(fakeTrack({ refuse: ['plain', 'advanced'] }), 2)).toBe(false)
    expect(await applyZoom(fakeTrack({ ignore: ['plain', 'advanced'] }), 2)).toBe(false)
  })

  it('trusts a track that does not report its zoom', async () => {
    const track = fakeTrack({ reports: false })
    expect(await applyZoom(track, 2)).toBe(true)
    expect(track.applyConstraints).toHaveBeenCalledTimes(1)
  })
})
