/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const zxing = vi.hoisted(() => ({ events: [], detect: () => Promise.resolve([]) }))

vi.mock('barcode-detector/ponyfill', () => ({
  prepareZXingModule: (options) => zxing.events.push(['prepare', options]),
  BarcodeDetector: class {
    constructor(options) {
      zxing.events.push(['construct', options])
    }
    detect(image) {
      return zxing.detect(image)
    }
  },
}))

const SIZE = { width: { ideal: 1920 }, height: { ideal: 1080 } }
const REAR_CAMERA = { video: { facingMode: { ideal: 'environment' }, ...SIZE }, audio: false }
const lensRequest = (deviceId) => ({ video: { deviceId: { exact: deviceId }, ...SIZE }, audio: false })

const videoinput = (deviceId, label) => ({ kind: 'videoinput', deviceId, label, groupId: '' })
const IPHONE = [
  videoinput('front', 'Front Camera'),
  videoinput('dual-wide', 'Back Dual Wide Camera'),
  videoinput('ultra-wide', 'Back Ultra Wide Camera'),
  videoinput('main', 'Back Camera'),
]

// getUserMedia answers only when the test grants a request, so a stream can arrive after cleanup.
// facingMode lands on `facing`; an exact deviceId lands on that device. With `zoom` (a capability)
// each track takes the zoom it is sent, unless `refuseZoom` names the forms it refuses; `capabilities`
// false leaves out getCapabilities, as a browser without it does.
function fakeCamera({ devices = [], facing = 'webcam', zoom = null, refuseZoom = [], capabilities = true } = {}) {
  const requests = []
  const streams = []
  const getUserMedia = vi.fn((constraints) => new Promise((resolve, reject) => requests.push({ constraints, resolve, reject })))
  const enumerateDevices = vi.fn(async () => camera.devices)
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia, enumerateDevices }, configurable: true })
  const camera = {
    devices,
    getUserMedia,
    enumerateDevices,
    async grant(index) {
      const video = requests[index].constraints.video
      const settings = { deviceId: video.deviceId?.exact ?? facing, ...(zoom && { zoom: 1 }) }
      const track = {
        readyState: 'live',
        stop: vi.fn(() => (track.readyState = 'ended')),
        getSettings: () => settings,
        ...(capabilities && { getCapabilities: () => (zoom ? { zoom } : {}) }),
        applyConstraints: vi.fn(async (constraints) => {
          if (refuseZoom.includes(constraints.advanced ? 'advanced' : 'plain')) throw new DOMException('no', 'OverconstrainedError')
          settings.zoom = constraints.zoom ?? constraints.advanced[0].zoom
        }),
      }
      const stream = { getTracks: () => [track], getVideoTracks: () => [track], track }
      streams.push(stream)
      await act(async () => requests[index].resolve(stream))
      return stream
    },
    async refuse(index, name) {
      await act(async () => requests[index].reject(new DOMException('refused', name)))
    },
    live: () => streams.filter(({ track }) => track.readyState === 'live').length,
  }
  return camera
}

// The video has a frame of this size, shown in a 480x360 preview.
function withFrames(width = 1920, height = 1080) {
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4)
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(width)
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(height)
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(480)
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(360)
}

const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))

let BarcodeScanner
let consoleError
let drawImage
beforeEach(async () => {
  // The scanner keeps the chosen lens for the page's later scans; each test is a fresh page.
  vi.resetModules()
  zxing.events = []
  zxing.detect = () => Promise.resolve([])
  ;({ default: BarcodeScanner } = await import('../src/components/BarcodeScanner.jsx'))
  consoleError = vi.spyOn(console, 'error')
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
    return { canvas: this, drawImage }
  })
})
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled()
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete navigator.mediaDevices
})

const scanButton = () => screen.getByRole('button', { name: /scan barcode/i })
const ZOOM = { min: 1, max: 10, step: 0.1 }
const zoomButton = (name) => within(screen.getByRole('group', { name: 'Zoom' })).getByRole('button', { name })
const pressed = () => within(screen.getByRole('group', { name: 'Zoom' })).getAllByRole('button', { pressed: true }).map((button) => button.textContent)

describe('BarcodeScanner', () => {
  it('opens the rear camera at 1080p only when the Scan button is tapped', async () => {
    const camera = fakeCamera()
    render(<StrictMode><BarcodeScanner onDetected={() => {}} /></StrictMode>)
    expect(camera.getUserMedia).not.toHaveBeenCalled()
    fireEvent.click(scanButton())
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1)
    expect(camera.getUserMedia).toHaveBeenCalledWith(REAR_CAMERA)
    const video = document.querySelector('video')
    expect(video.hasAttribute('playsinline')).toBe(true)
    expect(video.hasAttribute('autoplay')).toBe(true)
    expect(video.muted).toBe(true)
    const stream = await camera.grant(0)
    expect(video.srcObject).toBe(stream)
  })

  it('points the ZXing module at the bundled WASM before constructing a detector', async () => {
    const camera = fakeCamera()
    render(<BarcodeScanner onDetected={() => {}} />)
    fireEvent.click(scanButton())
    await camera.grant(0)
    const [first, ...rest] = zxing.events
    expect(first[0]).toBe('prepare')
    expect(rest.map(([event]) => event)).toEqual(['construct'])
    expect(rest[0][1]).toEqual({ formats: ['ean_13'] })
    const { locateFile } = first[1].overrides
    expect(locateFile('zxing_reader.wasm', 'https://fastly.jsdelivr.net/npm/zxing-wasm/dist/reader/')).toMatch(/^\/.*zxing_reader\.wasm$/)
    expect(locateFile('zxing_reader.js', 'https://example.org/')).toBe('https://example.org/zxing_reader.js')
  })

  it('stops every track under StrictMode, including a stream that arrives after the cleanup', async () => {
    const camera = fakeCamera()
    const { unmount } = render(<StrictMode><BarcodeScanner autoStart onDetected={() => {}} /></StrictMode>)
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2)
    const early = await camera.grant(0)
    expect(early.track.stop).toHaveBeenCalled()
    await camera.grant(1)
    expect(camera.live()).toBe(1)
    unmount()
    expect(camera.live()).toBe(0)
  })

  it('stops a stream that arrives after the scanner is gone', async () => {
    const camera = fakeCamera()
    const { unmount } = render(<StrictMode><BarcodeScanner onDetected={() => {}} /></StrictMode>)
    fireEvent.click(scanButton())
    unmount()
    const late = await camera.grant(0)
    expect(late.track.stop).toHaveBeenCalled()
    expect(camera.live()).toBe(0)
  })

  it('stops the camera when the person stops scanning', async () => {
    const camera = fakeCamera()
    render(<BarcodeScanner onDetected={() => {}} />)
    fireEvent.click(scanButton())
    await camera.grant(0)
    fireEvent.click(screen.getByRole('button', { name: /stop scanning/i }))
    expect(camera.live()).toBe(0)
    expect(scanButton()).toBeTruthy()
  })

  it('reports the first valid ISBN once, ignoring other EAN-13 codes, and stops the camera', async () => {
    withFrames()
    const answers = [[], [{ rawValue: '5000112637922' }], [{ rawValue: '9780553212587' }, { rawValue: '9780553212587' }]]
    zxing.detect = vi.fn(async () => answers.shift() ?? [{ rawValue: '9780553212587' }])
    const onDetected = vi.fn()
    const camera = fakeCamera()
    render(<StrictMode><BarcodeScanner onDetected={onDetected} /></StrictMode>)
    fireEvent.click(scanButton())
    await camera.grant(0)
    await waitFor(() => expect(onDetected).toHaveBeenCalled())
    expect(onDetected).toHaveBeenCalledTimes(1)
    expect(onDetected).toHaveBeenCalledWith('9780553212587')
    expect(camera.live()).toBe(0)
    expect(scanButton()).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(onDetected).toHaveBeenCalledTimes(1)
  })

  it('does not call detect before the video has a frame', async () => {
    withFrames()
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(1)
    zxing.detect = vi.fn(async () => [])
    const camera = fakeCamera()
    render(<BarcodeScanner onDetected={() => {}} />)
    fireEvent.click(scanButton())
    await camera.grant(0)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(zxing.detect).not.toHaveBeenCalled()
  })

  it('decodes the middle band of what the preview shows, at the frame’s own pixel size', async () => {
    withFrames(1920, 1080)
    zxing.detect = vi.fn(async () => [])
    const camera = fakeCamera()
    render(<BarcodeScanner onDetected={() => {}} />)
    fireEvent.click(scanButton())
    await camera.grant(0)
    await waitFor(() => expect(zxing.detect).toHaveBeenCalled())
    const canvas = zxing.detect.mock.calls[0][0]
    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect([canvas.width, canvas.height]).toEqual([1440, 432])
    expect(drawImage).toHaveBeenCalledWith(document.querySelector('video'), 240, 324, 1440, 432, 0, 0, 1440, 432)
  })

  it('looks at the band every 120 ms', async () => {
    vi.useFakeTimers()
    withFrames()
    zxing.detect = vi.fn(async () => [])
    const camera = fakeCamera()
    render(<BarcodeScanner onDetected={() => {}} />)
    fireEvent.click(scanButton())
    await camera.grant(0)
    await tick()
    expect(zxing.detect).toHaveBeenCalledTimes(1)
    await tick(119)
    expect(zxing.detect).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(zxing.detect).toHaveBeenCalledTimes(2)
    await tick(1200)
    expect(zxing.detect).toHaveBeenCalledTimes(12)
  })

  it('re-opens the camera on the main lens when facingMode lands on another, and opens it at once next time', async () => {
    const camera = fakeCamera({ devices: IPHONE, facing: 'dual-wide' })
    const first = render(<BarcodeScanner onDetected={() => {}} />)
    fireEvent.click(scanButton())
    expect(camera.getUserMedia).toHaveBeenLastCalledWith(REAR_CAMERA)
    const virtual = await camera.grant(0)
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(2))
    expect(camera.getUserMedia).toHaveBeenLastCalledWith(lensRequest('main'))
    expect(virtual.track.stop).toHaveBeenCalled()
    const main = await camera.grant(1)
    expect(document.querySelector('video').srcObject).toBe(main)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2)
    first.unmount()

    render(<BarcodeScanner autoStart onDetected={() => {}} />)
    expect(camera.getUserMedia).toHaveBeenCalledTimes(3)
    expect(camera.getUserMedia).toHaveBeenLastCalledWith(lensRequest('main'))
    await camera.grant(2)
    await waitFor(() => expect(camera.enumerateDevices).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(camera.getUserMedia).toHaveBeenCalledTimes(3)
    expect(camera.live()).toBe(1)
  })

  it('keeps the camera when facingMode already landed on the main lens', async () => {
    const camera = fakeCamera({ devices: IPHONE, facing: 'main' })
    render(<BarcodeScanner autoStart onDetected={() => {}} />)
    await camera.grant(0)
    await waitFor(() => expect(camera.enumerateDevices).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1)
    expect(camera.live()).toBe(1)
  })

  it('does not open the camera again when the scanner closes while the lenses are listed', async () => {
    const camera = fakeCamera({ facing: 'dual-wide' })
    let list
    camera.enumerateDevices.mockReturnValueOnce(new Promise((resolve) => (list = resolve)))
    const { unmount } = render(<BarcodeScanner autoStart onDetected={() => {}} />)
    await camera.grant(0)
    await waitFor(() => expect(camera.enumerateDevices).toHaveBeenCalled())
    unmount()
    await act(async () => list(IPHONE))
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1)
    expect(camera.live()).toBe(0)
  })

  it('keeps the facingMode camera when the labels are empty', async () => {
    const camera = fakeCamera({ devices: IPHONE.map((device) => ({ ...device, label: '' })), facing: 'dual-wide' })
    render(<BarcodeScanner autoStart onDetected={() => {}} />)
    await camera.grant(0)
    await waitFor(() => expect(camera.enumerateDevices).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1)
  })

  it.each(['OverconstrainedError', 'NotFoundError'])('falls back to facingMode when the remembered lens is gone (%s)', async (name) => {
    const camera = fakeCamera({ devices: IPHONE, facing: 'main' })
    const first = render(<BarcodeScanner autoStart onDetected={() => {}} />)
    await camera.grant(0)
    await waitFor(() => expect(camera.enumerateDevices).toHaveBeenCalled())
    first.unmount()

    camera.devices = []
    render(<BarcodeScanner autoStart onDetected={() => {}} />)
    expect(camera.getUserMedia).toHaveBeenLastCalledWith(lensRequest('main'))
    await camera.refuse(1, name)
    expect(camera.getUserMedia).toHaveBeenCalledTimes(3)
    expect(camera.getUserMedia).toHaveBeenLastCalledWith(REAR_CAMERA)
    const stream = await camera.grant(2)
    expect(document.querySelector('video').srcObject).toBe(stream)
    expect(screen.queryByText(/could not be started|No camera/)).toBeNull()
  })

  it('keeps scanning when the devices cannot be listed', async () => {
    const camera = fakeCamera()
    camera.enumerateDevices.mockRejectedValue(new DOMException('no', 'NotAllowedError'))
    render(<BarcodeScanner autoStart onDetected={() => {}} />)
    const stream = await camera.grant(0)
    await waitFor(() => expect(camera.enumerateDevices).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByText(/refused|could not be started/)).toBeNull()
    expect(document.querySelector('video').srcObject).toBe(stream)
    expect(camera.live()).toBe(1)
  })

  it('offers 1x and 2x when the camera has a zoom, at 2x unless the toggle said otherwise', async () => {
    const camera = fakeCamera({ zoom: ZOOM })
    render(<BarcodeScanner autoStart onDetected={() => {}} />)
    const stream = await camera.grant(0)
    await waitFor(() => expect(screen.getByRole('group', { name: 'Zoom' })).toBeTruthy())
    expect(pressed()).toEqual(['2×'])
    expect(within(screen.getByRole('group', { name: 'Zoom' })).getAllByRole('button').map((button) => button.textContent)).toEqual(['1×', '2×'])
    expect(stream.track.applyConstraints).toHaveBeenCalledTimes(1)
    expect(stream.track.applyConstraints).toHaveBeenLastCalledWith({ ...SIZE, zoom: 2 })
  })

  it('zooms the live track to 2x and back without reopening the camera, and keeps the choice for later scans', async () => {
    const camera = fakeCamera({ zoom: ZOOM })
    const first = render(<BarcodeScanner autoStart onDetected={() => {}} />)
    const stream = await camera.grant(0)
    await waitFor(() => expect(screen.getByRole('group', { name: 'Zoom' })).toBeTruthy())
    await act(async () => fireEvent.click(zoomButton('2×')))
    expect(stream.track.applyConstraints).toHaveBeenLastCalledWith({ ...SIZE, zoom: 2 })
    expect(stream.track.getSettings().zoom).toBe(2)
    expect(pressed()).toEqual(['2×'])
    await act(async () => fireEvent.click(zoomButton('1×')))
    expect(stream.track.applyConstraints).toHaveBeenLastCalledWith({ ...SIZE, zoom: 1 })
    expect(pressed()).toEqual(['1×'])
    await act(async () => fireEvent.click(zoomButton('2×')))
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1)
    expect(stream.track.stop).not.toHaveBeenCalled()
    first.unmount()

    render(<BarcodeScanner autoStart onDetected={() => {}} />)
    const later = await camera.grant(1)
    await waitFor(() => expect(pressed()).toEqual(['2×']))
    expect(later.track.applyConstraints).toHaveBeenCalledWith({ ...SIZE, zoom: 2 })
  })

  it('hides the zoom when the camera has none', async () => {
    const camera = fakeCamera()
    render(<BarcodeScanner autoStart onDetected={() => {}} />)
    const stream = await camera.grant(0)
    await waitFor(() => expect(camera.enumerateDevices).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByRole('group', { name: 'Zoom' })).toBeNull()
    expect(stream.track.applyConstraints).not.toHaveBeenCalled()
  })

  it('hides the zoom for a browser without getCapabilities', async () => {
    const camera = fakeCamera({ zoom: ZOOM, capabilities: false })
    render(<BarcodeScanner autoStart onDetected={() => {}} />)
    await camera.grant(0)
    await waitFor(() => expect(camera.enumerateDevices).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByRole('group', { name: 'Zoom' })).toBeNull()
  })

  it('zooms through an advanced constraint when the plain one is refused', async () => {
    const camera = fakeCamera({ zoom: ZOOM, refuseZoom: ['plain'] })
    render(<BarcodeScanner autoStart onDetected={() => {}} />)
    const stream = await camera.grant(0)
    await waitFor(() => expect(screen.getByRole('group', { name: 'Zoom' })).toBeTruthy())
    await act(async () => fireEvent.click(zoomButton('2×')))
    expect(stream.track.applyConstraints).toHaveBeenLastCalledWith({ ...SIZE, advanced: [{ zoom: 2 }] })
    expect(pressed()).toEqual(['2×'])
  })

  it('takes the zoom away, at 1x for later scans, when the camera refuses it', async () => {
    const camera = fakeCamera({ zoom: ZOOM, refuseZoom: ['plain', 'advanced'] })
    const first = render(<BarcodeScanner autoStart onDetected={() => {}} />)
    const stream = await camera.grant(0)
    await waitFor(() => expect(stream.track.applyConstraints).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('group', { name: 'Zoom' })).toBeNull()
    expect(screen.queryByText(/could not be started|refused/)).toBeNull()
    expect(camera.live()).toBe(1)
    first.unmount()

    render(<BarcodeScanner autoStart onDetected={() => {}} />)
    const later = await camera.grant(1)
    await waitFor(() => expect(pressed()).toEqual(['1×']))
    expect(later.track.applyConstraints).not.toHaveBeenCalled()
    expect(stream.track.applyConstraints).toHaveBeenCalledTimes(2)
  })

  it('offers the zoom on the main lens once the camera has switched to it', async () => {
    const camera = fakeCamera({ devices: IPHONE, facing: 'dual-wide', zoom: ZOOM })
    render(<BarcodeScanner autoStart onDetected={() => {}} />)
    const virtual = await camera.grant(0)
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('group', { name: 'Zoom' })).toBeNull()
    const main = await camera.grant(1)
    await waitFor(() => expect(screen.getByRole('group', { name: 'Zoom' })).toBeTruthy())
    await act(async () => fireEvent.click(zoomButton('2×')))
    expect(main.track.applyConstraints).toHaveBeenCalledWith({ ...SIZE, zoom: 2 })
    expect(virtual.track.applyConstraints).not.toHaveBeenCalled()
  })

  it('hides the zoom once the scanner stops, until the next camera offers it', async () => {
    const camera = fakeCamera({ zoom: ZOOM })
    render(<BarcodeScanner onDetected={() => {}} />)
    fireEvent.click(scanButton())
    await camera.grant(0)
    await waitFor(() => expect(screen.getByRole('group', { name: 'Zoom' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /stop scanning/i }))
    fireEvent.click(scanButton())
    expect(screen.queryByRole('group', { name: 'Zoom' })).toBeNull()
    await camera.grant(1)
    await waitFor(() => expect(screen.getByRole('group', { name: 'Zoom' })).toBeTruthy())
  })

  it('offers manual entry on an insecure origin and converts an ISBN-10', () => {
    delete navigator.mediaDevices
    const onDetected = vi.fn()
    render(<BarcodeScanner onDetected={onDetected} />)
    expect(screen.getByText(/needs a secure connection/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /scan barcode|camera again/i })).toBeNull()
    const input = screen.getByRole('searchbox', { name: 'ISBN' })
    fireEvent.change(input, { target: { value: 'not an isbn' } })
    fireEvent.click(screen.getByRole('button', { name: /use isbn/i }))
    expect(screen.getByText('That is not a valid ISBN.')).toBeTruthy()
    expect(onDetected).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '0-553-21258-3' } })
    fireEvent.click(screen.getByRole('button', { name: /use isbn/i }))
    expect(onDetected).toHaveBeenCalledWith('9780553212587')
  })

  it('offers manual entry and another try when camera access is refused', async () => {
    const camera = fakeCamera()
    render(<BarcodeScanner onDetected={() => {}} />)
    fireEvent.click(scanButton())
    await camera.refuse(0, 'NotAllowedError')
    expect(screen.getByText(/Camera access was refused/)).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: 'ISBN' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /try the camera again/i }))
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2)
  })

  it('says so when there is no camera', async () => {
    const camera = fakeCamera()
    render(<BarcodeScanner onDetected={() => {}} />)
    fireEvent.click(scanButton())
    await camera.refuse(0, 'NotFoundError')
    expect(screen.getByText(/No camera was found/)).toBeTruthy()
  })

  it('falls back to manual entry and stops the camera when detection is not supported', async () => {
    withFrames()
    zxing.detect = () => Promise.reject(new DOMException('Barcode detection service unavailable.', 'NotSupportedError'))
    const camera = fakeCamera()
    render(<BarcodeScanner onDetected={() => {}} />)
    fireEvent.click(scanButton())
    await camera.grant(0)
    await waitFor(() => expect(screen.getByText(/does not work in this browser/)).toBeTruthy())
    expect(camera.live()).toBe(0)
    expect(screen.getByRole('searchbox', { name: 'ISBN' })).toBeTruthy()
  })
})
