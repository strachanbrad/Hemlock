/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BarcodeScanner from '../src/components/BarcodeScanner.jsx'

const zxing = vi.hoisted(() => ({ events: [], detect: () => Promise.resolve([]) }))

vi.mock('barcode-detector/ponyfill', () => ({
  prepareZXingModule: (options) => zxing.events.push(['prepare', options]),
  BarcodeDetector: class {
    constructor(options) {
      zxing.events.push(['construct', options])
    }
    detect(video) {
      return zxing.detect(video)
    }
  },
}))

const REAR_CAMERA = { video: { facingMode: { ideal: 'environment' } }, audio: false }

// getUserMedia answers only when the test grants a request, so a stream can arrive after cleanup.
function fakeCamera() {
  const requests = []
  const streams = []
  const getUserMedia = vi.fn(() => new Promise((resolve, reject) => requests.push({ resolve, reject })))
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  return {
    getUserMedia,
    async grant(index) {
      const track = { readyState: 'live', stop: vi.fn(() => (track.readyState = 'ended')) }
      const stream = { getTracks: () => [track], track }
      streams.push(stream)
      await act(async () => requests[index].resolve(stream))
      return stream
    },
    async refuse(index, name) {
      await act(async () => requests[index].reject(new DOMException('refused', name)))
    },
    live: () => streams.filter(({ track }) => track.readyState === 'live').length,
  }
}

let consoleError
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error')
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  zxing.detect = () => Promise.resolve([])
})
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  delete navigator.mediaDevices
})

const scanButton = () => screen.getByRole('button', { name: /scan barcode/i })

describe('BarcodeScanner', () => {
  it('opens the rear camera only when the Scan button is tapped', async () => {
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
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4)
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
    zxing.detect = vi.fn(async () => [])
    const camera = fakeCamera()
    render(<BarcodeScanner onDetected={() => {}} />)
    fireEvent.click(scanButton())
    await camera.grant(0)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(zxing.detect).not.toHaveBeenCalled()
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
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4)
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
