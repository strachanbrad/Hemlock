/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Input, Typography } from 'antd'
import { CameraOutlined } from '@ant-design/icons'
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { isValidIsbn13, toIsbn13 } from '../lib/isbn.js'
import './BarcodeScanner.css'

// Runs before any BarcodeDetector exists: construction starts the WASM load, and without this
// override the glue fetches the file from jsDelivr instead of this server.
prepareZXingModule({
  overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
})

const SCAN_INTERVAL_MS = 150

let detector = null
const getDetector = () => (detector ??= new BarcodeDetector({ formats: ['ean_13'] }))

// navigator.mediaDevices is undefined outside a secure context (https, or localhost).
const cameraAvailable = () => Boolean(globalThis.navigator?.mediaDevices?.getUserMedia)

const stopTracks = (stream) => stream?.getTracks().forEach((track) => track.stop())

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
  const videoRef = useRef(null)
  const onDetectedRef = useRef(onDetected)

  useEffect(() => {
    onDetectedRef.current = onDetected
  })

  useEffect(() => {
    if (phase !== 'scanning') return undefined
    let stopped = false
    let stream = null
    let timer = null

    const stop = () => {
      stopped = true
      clearTimeout(timer)
      stopTracks(stream)
      stream = null
      if (videoRef.current) videoRef.current.srcObject = null
    }

    const scan = async (barcodeDetector) => {
      if (stopped) return
      const video = videoRef.current
      // detect() throws InvalidStateError until the video has a frame (readyState 2).
      if (video && video.readyState >= 2) {
        try {
          const codes = await barcodeDetector.detect(video)
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
      timer = setTimeout(() => scan(barcodeDetector), SCAN_INTERVAL_MS)
    }

    const barcodeDetector = getDetector()
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(
      (granted) => {
        // StrictMode and a fast unmount both clean up before a pending stream arrives.
        if (stopped) {
          stopTracks(granted)
          return
        }
        stream = granted
        videoRef.current.srcObject = granted
        videoRef.current.play().catch(() => {})
        scan(barcodeDetector)
      },
      (error) => {
        if (!stopped) setPhase(failure(error))
      },
    )
    return stop
  }, [phase])

  if (phase === 'scanning') {
    return (
      <div className="barcode-scanner">
        <div className="barcode-scanner__viewport">
          <video ref={videoRef} className="barcode-scanner__video" playsInline muted autoPlay />
          <div className="barcode-scanner__aim" aria-hidden="true" />
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
