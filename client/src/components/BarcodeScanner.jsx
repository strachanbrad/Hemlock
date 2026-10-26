/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Input, Typography } from 'antd'
import { CameraOutlined } from '@ant-design/icons'
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { applyZoom, bandRect, chooseLens, videoConstraints, zoomLevel } from '../lib/camera.js'
import { isValidIsbn13, toIsbn13 } from '../lib/isbn.js'
import './BarcodeScanner.css'

// Runs before any BarcodeDetector exists: construction starts the WASM load, and without this
// override the glue fetches the file from jsDelivr instead of this server.
prepareZXingModule({
  overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
})

const SCAN_INTERVAL_MS = 120

let detector = null
const getDetector = () => (detector ??= new BarcodeDetector({ formats: ['ean_13'] }))

// The lens chooseLens picked, kept for the page's later scans so they open it at once.
let lens = null
// The zoom chosen on the toggle, kept for the page's later scans; 2x until the toggle says 1x.
let zoomFactor = 2
const ZOOMS = [1, 2]

// navigator.mediaDevices is undefined outside a secure context (https, or localhost).
const cameraAvailable = () => Boolean(globalThis.navigator?.mediaDevices?.getUserMedia)

const stopTracks = (stream) => stream?.getTracks().forEach((track) => track.stop())

// A device that vanished answers OverconstrainedError to an exact deviceId.
const lensGone = (error) => error?.name === 'OverconstrainedError' || error?.name === 'NotFoundError'

function failure(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'denied'
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'nocamera'
  return 'failed'
}

const NOTICES = {
  insecure: { type: 'info', title: 'The camera needs a secure connection (https). Type the ISBN instead.' },
  denied: { type: 'warning', title: 'Camera access was refused. Allow it in the browser’s site settings, or type the ISBN.', retry: true },
  nocamera: { type: 'info', title: 'No camera was found. Type the ISBN instead.', retry: true },
  unsupported: { type: 'info', title: 'Barcode scanning does not work in this browser. Type the ISBN instead.' },
  failed: { type: 'warning', title: 'The camera could not be started. Try again, or type the ISBN.', retry: true },
}

function ManualIsbn({ onIsbn }) {
  const [value, setValue] = useState('')
  const [invalid, setInvalid] = useState(false)

  const submit = (text) => {
    const isbn = toIsbn13(text)
    setInvalid(!isbn)
    if (isbn) onIsbn(isbn)
  }

  return (
    <div className="barcode-scanner__manual">
      <Input.Search
        aria-label="ISBN"
        placeholder="ISBN-10 or ISBN-13"
        enterButton="Use ISBN"
        value={value}
        status={invalid ? 'error' : undefined}
        onChange={(event) => {
          setValue(event.target.value)
          setInvalid(false)
        }}
        onSearch={submit}
      />
      {invalid && <Typography.Text type="danger">That is not a valid ISBN.</Typography.Text>}
    </div>
  )
}

// Calls onDetected(isbn13) once per scan, with the camera already stopped. The camera opens from
// the Scan tap, or at mount with autoStart (for a scanner mounted by a tap, as in a modal).
export default function BarcodeScanner({ onDetected, autoStart = false }) {
  const [phase, setPhase] = useState(() => (!cameraAvailable() ? 'insecure' : autoStart ? 'scanning' : 'idle'))
  const [zoom, setZoom] = useState(null)
  const videoRef = useRef(null)
  const zoomRef = useRef(null)
  const onDetectedRef = useRef(onDetected)

  useEffect(() => {
    onDetectedRef.current = onDetected
  })

  useEffect(() => {
    if (phase !== 'scanning') return undefined
    let stopped = false
    let stream = null
    let timer = null
    let context = null

    const release = () => {
      stopTracks(stream)
      stream = null
    }

    // Answers false when the scanner stopped while the camera was opening.
    const open = async () => {
      const ask = () => navigator.mediaDevices.getUserMedia({ video: videoConstraints(lens), audio: false })
      let granted
      try {
        granted = await ask()
      } catch (error) {
        if (!lens || !lensGone(error)) throw error
        lens = null
        granted = await ask()
      }
      // StrictMode and a fast unmount both clean up before a pending stream arrives.
      if (stopped) {
        stopTracks(granted)
        return false
      }
      stream = granted
      videoRef.current.srcObject = granted
      videoRef.current.play().catch(() => {})
      return true
    }

    const track = () => stream?.getVideoTracks()[0]

    // Labels exist only once the camera is open, so the first open of a page takes facingMode.
    const pinLens = async () => {
      const chosen = chooseLens(await navigator.mediaDevices.enumerateDevices().catch(() => []))
      if (!chosen || stopped) return
      lens = chosen.deviceId
      if (track()?.getSettings().deviceId === lens) return
      release()
      await open()
    }

    // Answers false when the camera refuses the zoom.
    const zoomTo = (factor) => applyZoom(track(), zoomLevel(track().getCapabilities().zoom, factor))

    // A fresh track is at 1x; the chosen zoom is applied when the camera offers one.
    const offerZoom = async () => {
      if (stopped || zoomLevel(track()?.getCapabilities?.().zoom, 1) == null) return
      if (zoomFactor !== 1 && !(await zoomTo(zoomFactor))) {
        zoomFactor = 1
        return
      }
      if (!stopped) setZoom(zoomFactor)
    }

    const stop = () => {
      stopped = true
      clearTimeout(timer)
      setZoom(null)
      release()
      if (videoRef.current) videoRef.current.srcObject = null
    }

    const drawBand = (video, band) => {
      context ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
      const { canvas } = context
      if (canvas.width !== band.width) canvas.width = band.width
      if (canvas.height !== band.height) canvas.height = band.height
      context.drawImage(video, band.x, band.y, band.width, band.height, 0, 0, band.width, band.height)
      return canvas
    }

    const scan = async () => {
      if (stopped) return
      const video = videoRef.current
      // Before a frame (readyState 2) the video has no picture to draw.
      const band = video?.readyState >= 2 && bandRect(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight)
      if (band) {
        try {
          const codes = await getDetector().detect(drawBand(video, band))
          if (stopped) return
          const isbn = codes.map((code) => code.rawValue).find(isValidIsbn13)
          if (isbn) {
            stop()
            setPhase('idle')
            onDetectedRef.current(isbn)
            return
          }
        } catch (error) {
          if (stopped) return
          if (error?.name === 'NotSupportedError') {
            stop()
            setPhase('unsupported')
            return
          }
        }
      }
      timer = setTimeout(scan, SCAN_INTERVAL_MS)
    }

    const start = async () => {
      try {
        if (!(await open())) return
        scan()
        await pinLens()
        await offerZoom()
      } catch (error) {
        if (!stopped) setPhase(failure(error))
      }
    }

    getDetector()
    zoomRef.current = async (factor) => {
      zoomFactor = factor
      if (await zoomTo(factor)) return
      zoomFactor = 1
      if (!stopped) setZoom(null)
    }
    start()
    return stop
  }, [phase])

  const chooseZoom = (factor) => {
    setZoom(factor)
    zoomRef.current(factor)
  }

  if (phase === 'scanning') {
    return (
      <div className="barcode-scanner">
        <div className="barcode-scanner__viewport">
          <video ref={videoRef} className="barcode-scanner__video" playsInline muted autoPlay />
          <div className="barcode-scanner__aim" aria-hidden="true" />
          {zoom && (
            <div className="barcode-scanner__zoom" role="group" aria-label="Zoom">
              {ZOOMS.map((factor) => (
                <button key={factor} type="button" aria-pressed={zoom === factor} onClick={() => chooseZoom(factor)}>
                  {factor}×
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="barcode-scanner__hint">Hold the barcode on the back of the book inside the frame.</p>
        <Button onClick={() => setPhase('idle')}>Stop scanning</Button>
      </div>
    )
  }

  const notice = NOTICES[phase]
  return (
    <div className="barcode-scanner">
      {notice && <Alert type={notice.type} title={notice.title} showIcon />}
      {(phase === 'idle' || notice?.retry) && (
        <Button type="primary" icon={<CameraOutlined />} onClick={() => setPhase('scanning')}>
          {phase === 'idle' ? 'Scan barcode' : 'Try the camera again'}
        </Button>
      )}
      {notice && <ManualIsbn onIsbn={(isbn) => onDetectedRef.current(isbn)} />}
    </div>
  )
}
