/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Button, Input, Modal, Space, Spin } from 'antd'
import { CameraOutlined } from '@ant-design/icons'
import { identifyIsbn, lookupIsbn } from '../api/lookup.js'
import { toIsbn13 } from '../lib/isbn.js'
import { fromClaude, sourceHost } from '../lib/prefill.js'

// Loaded on the first Scan tap, so the ZXing glue and WASM stay out of every other page.
const BarcodeScanner = lazy(() => import('./BarcodeScanner.jsx'))

function foundText({ title, authors, source_url: sourceUrl, ...record }) {
  const by = authors.length ? ` by ${authors.join(' & ')}` : ''
  const host = sourceHost(sourceUrl)
  const via = fromClaude(record) ? `, via Claude${host ? ` from ${host}` : ''}` : ''
  return `Found ${title ? `“${title}”` : 'the book'}${by}${via}.`
}

function Notice({ state }) {
  if (state.phase === 'loading') return <div className="isbn-notice"><Spin size="small" /> Looking up {state.isbn}</div>
  if (state.phase === 'asking') return <div className="isbn-notice"><Spin size="small" /> Not in the catalogues. Asking Claude…</div>
  if (state.phase === 'found') return <div className="isbn-notice isbn-notice-found">{foundText(state.record)}</div>
  if (state.phase === 'missing') {
    const nobody = state.asked ? 'No catalogue or search knows' : 'No book source knows'
    return <div className="isbn-notice">{nobody} {state.isbn}; fill in the details by hand.</div>
  }
  if (state.phase === 'invalid') return <div className="isbn-notice isbn-notice-error">Enter a valid ISBN-10 or ISBN-13 to look it up.</div>
  if (state.phase === 'error') {
    const failed = state.asked ? state.message : `The lookup failed (${state.message})`
    return <div className="isbn-notice isbn-notice-error">{failed}; fill in the details by hand.</div>
  }
  return null
}

// Controlled by Form (value, onChange). onLookup(record, { scanned, isbn }) receives the newest
// lookup's outcome once, after Claude when the catalogues miss and a Claude key is set; record is
// null when nothing knows the ISBN or the lookup failed. A newer lookup or unmounting drops an older one.
const IsbnField = ({ id, value, onChange, onLookup, size, prominent = false, placeholder }) => {
  const [scanning, setScanning] = useState(false)
  const [state, setState] = useState({ phase: 'idle' })
  const latest = useRef(0)

  useEffect(() => {
    const tickets = latest
    return () => {
      tickets.current++
    }
  }, [])

  const lookup = async (raw, scanned) => {
    const isbn = toIsbn13(raw ?? '')
    if (!isbn) {
      setState({ phase: 'invalid' })
      return
    }
    const ticket = ++latest.current
    const stale = () => ticket !== latest.current
    setState({ phase: 'loading', isbn })
    let record
    let asked = false
    try {
      const answer = await lookupIsbn(isbn)
      if (stale()) return
      record = answer.record
      if (!record && answer.sources.anthropic === 'available') {
        asked = true
        setState({ phase: 'asking', isbn })
        record = await identifyIsbn(isbn)
        if (stale()) return
      }
    } catch (err) {
      if (stale()) return
      setState({ phase: 'error', message: err.message, asked })
      onLookup(null, { scanned, isbn })
      return
    }
    setState(record ? { phase: 'found', isbn, record } : { phase: 'missing', isbn, asked })
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
