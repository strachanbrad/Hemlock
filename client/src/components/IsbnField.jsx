/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { lazy, Suspense, useRef, useState } from 'react'
import { Button, Input, Modal, Space, Spin } from 'antd'
import { CameraOutlined } from '@ant-design/icons'
import { lookupIsbn } from '../api/lookup.js'
import { toIsbn13 } from '../lib/isbn.js'

// Loaded on the first Scan tap, so the ZXing glue and WASM stay out of every other page.
const BarcodeScanner = lazy(() => import('./BarcodeScanner.jsx'))

function Notice({ state }) {
  if (state.phase === 'loading') return <div className="isbn-notice"><Spin size="small" /> Looking up {state.isbn}</div>
  if (state.phase === 'found') {
    const by = state.record.authors.length ? ` by ${state.record.authors.join(' & ')}` : ''
    return <div className="isbn-notice isbn-notice-found">Found {state.record.title ? `“${state.record.title}”` : 'the book'}{by}.</div>
  }
  if (state.phase === 'missing') return <div className="isbn-notice">No book source knows {state.isbn}; fill in the details by hand.</div>
  if (state.phase === 'invalid') return <div className="isbn-notice isbn-notice-error">Enter a valid ISBN-10 or ISBN-13 to look it up.</div>
  if (state.phase === 'error') return <div className="isbn-notice isbn-notice-error">The lookup failed ({state.message}); fill in the details by hand.</div>
  return null
}

// Controlled by Form (value, onChange). onLookup(record, { scanned, isbn }) receives the newest
// lookup's outcome; record is null when no source knows the ISBN or the lookup failed.
const IsbnField = ({ id, value, onChange, onLookup, size, prominent = false, placeholder }) => {
  const [scanning, setScanning] = useState(false)
  const [state, setState] = useState({ phase: 'idle' })
  const latest = useRef(0)

  const lookup = async (raw, scanned) => {
    const isbn = toIsbn13(raw ?? '')
    if (!isbn) {
      setState({ phase: 'invalid' })
      return
    }
    const ticket = ++latest.current
    setState({ phase: 'loading', isbn })
    let record = null
    let failure = null
    try {
      record = await lookupIsbn(isbn)
    } catch (err) {
      failure = err
    }
    if (ticket !== latest.current) return
    if (failure) setState({ phase: 'error', message: failure.message })
    else setState(record ? { phase: 'found', isbn, record } : { phase: 'missing', isbn })
    onLookup(record, { scanned, isbn })
  }

  return (
    <div className="isbn-field">
      <Space.Compact block>
        <Input
          id={id}
          value={value}
          size={size}
          placeholder={placeholder}
          inputMode="numeric"
          autoComplete="off"
          onChange={(event) => onChange?.(event.target.value)}
          onPressEnter={(event) => {
            event.preventDefault()
            lookup(value, false)
          }}
        />
        <Button size={size} onClick={() => lookup(value, false)} loading={state.phase === 'loading'}>Look up</Button>
        <Button size={size} type={prominent ? 'primary' : 'default'} icon={<CameraOutlined aria-hidden="true" />} onClick={() => setScanning(true)}>Scan</Button>
      </Space.Compact>
      <Notice state={state} />
      <Modal title="Scan the barcode" open={scanning} footer={null} destroyOnHidden onCancel={() => setScanning(false)}>
        <Suspense fallback={<Spin />}>
          <BarcodeScanner
            autoStart
            onDetected={(isbn) => {
              setScanning(false)
              onChange?.(isbn)
              lookup(isbn, true)
            }}
          />
        </Suspense>
      </Modal>
    </div>
  )
}

export default IsbnField
