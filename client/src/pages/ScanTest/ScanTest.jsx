/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useRef, useState } from 'react'
import { Alert, Descriptions, Input, Spin, Typography } from 'antd'
import { lookupIsbn } from '../../api/lookup.js'
import BarcodeScanner from '../../components/BarcodeScanner.jsx'
import './scan-test.css'

const FIELDS = [
  ['isbn', 'ISBN'],
  ['title', 'Title'],
  ['authors', 'Authors'],
  ['publisher', 'Publisher'],
  ['published', 'Published'],
  ['format', 'Format'],
  ['cover_url', 'Cover URL'],
  ['synopsis', 'Synopsis'],
]

const SOURCE_NAMES = { google: 'Google Books', open_library: 'Open Library', open_library_work: 'Open Library (work)' }

function show(value) {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'none'
  return value ?? 'none'
}

function Answer({ state }) {
  if (state.phase === 'loading') {
    return (
      <div className="scan-test__loading">
        <Spin size="small" /> Looking up {state.isbn}
      </div>
    )
  }
  if (state.phase === 'missing') return <Alert type="info" showIcon title={`No book source knows ISBN ${state.isbn}.`} />
  if (state.phase === 'error') return <Alert type="error" showIcon title={state.message} />
  if (state.phase !== 'found') return null

  const { record } = state
  const items = FIELDS.map(([key, label]) => ({
    key,
    label,
    children: (
      <span className="scan-test__value">
        {show(record[key])}
        {record.sources.fields[key] && <Typography.Text type="secondary"> ({SOURCE_NAMES[record.sources.fields[key]]})</Typography.Text>}
      </span>
    ),
  }))
  items.push({
    key: 'sources',
    label: 'Sources',
    children: `Open Library: ${record.sources.open_library}, Google Books: ${record.sources.google}`,
  })

  return (
    <div className="scan-test__answer">
      <Descriptions column={1} size="small" bordered items={items} />
      <details>
        <summary>The answer as JSON</summary>
        <pre className="scan-test__json">{JSON.stringify(record, null, 2)}</pre>
      </details>
    </div>
  )
}

// A development page for the scanner and the lookup; it saves nothing.
export default function ScanTest() {
  const [state, setState] = useState({ phase: 'idle' })
  const latest = useRef(0)
  const google = state.record?.sources.google

  const look = async (isbn) => {
    const request = ++latest.current
    setState({ phase: 'loading', isbn })
    try {
      const record = await lookupIsbn(isbn)
      if (request === latest.current) setState(record ? { phase: 'found', isbn, record } : { phase: 'missing', isbn })
    } catch (error) {
      if (request === latest.current) setState({ phase: 'error', isbn, message: error.message })
    }
  }

  return (
    <main className="scan-test">
      <Typography.Title level={1}>Scan test</Typography.Title>
      <Typography.Paragraph type="secondary">
        Scan a book’s barcode or type its ISBN to see what the lookup answers. Nothing is saved.
      </Typography.Paragraph>

      <section className="scan-test__section">
        <Typography.Title level={2}>Camera</Typography.Title>
        <BarcodeScanner onDetected={look} />
      </section>

      <section className="scan-test__section">
        <Typography.Title level={2}>ISBN</Typography.Title>
        <Input.Search
          aria-label="ISBN to look up"
          placeholder="ISBN-10 or ISBN-13"
          enterButton="Look up"
          onSearch={(text) => text.trim() && look(text.trim())}
        />
      </section>

      <section className="scan-test__section" aria-live="polite">
        <Answer state={state} />
      </section>

      <footer className="scan-test__credit">
        Book data from Open Library{google && google !== 'disabled' ? ' and Google Books' : ''}
      </footer>
    </main>
  )
}
