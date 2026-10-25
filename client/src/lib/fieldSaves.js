/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Overlapping saves of a book's fields. Each field settles on its own: while its newest save is
// pending it shows that save's value, and once that save settles it shows the value from the
// newest save that succeeded, or the value from before its first unsettled save.
export function createFieldSaves() {
  const entries = new Map()
  return {
    // Returns settle(saved), called once with the server's book or null for a failure. It answers
    // the fields to show now and whether the save was the newest of a field it failed to save.
    start(book, fields) {
      const started = Object.keys(fields).map((field) => {
        const key = `${book.id}:${field}`
        const entry = entries.get(key) ?? { value: book[field], valueSeq: 0, seq: 0, pending: 0, settled: false }
        entries.set(key, entry)
        entry.seq += 1
        entry.pending += 1
        entry.settled = false
        return { field, key, entry, seq: entry.seq }
      })
      return function settle(saved) {
        const show = {}
        let failed = false
        for (const { field, key, entry, seq } of started) {
          if (saved && seq > entry.valueSeq) {
            entry.value = saved[field]
            entry.valueSeq = seq
          }
          if (seq === entry.seq) {
            entry.settled = true
            failed ||= !saved
          }
          if (entry.settled) show[field] = entry.value
          entry.pending -= 1
          if (entry.pending === 0) entries.delete(key)
        }
        return { show, failed }
      }
    },
  }
}
