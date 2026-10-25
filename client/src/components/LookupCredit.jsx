/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { creditLine, fromClaude, sourceHost } from '../lib/prefill.js'

// A record from Claude credits the listing it was copied from; any other names the catalogues.
const LookupCredit = ({ record }) => {
  if (!fromClaude(record)) return <p className="credit secondary">{creditLine(record)}</p>
  const host = sourceHost(record.source_url)
  return (
    <p className="credit secondary">
      {host ? (
        <>Book data from <a href={record.source_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{host}</a>, found by Claude</>
      ) : (
        'Book data found by Claude'
      )}
    </p>
  )
}

export default LookupCredit
