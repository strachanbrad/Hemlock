/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { collapse } from './authors.js'

// Co-authors are one author row with the names joined by " & ".
export function authorFromLookup(names, authors) {
  const name = collapse((names ?? []).join(' & '))
  if (!name) return undefined
  const found = authors.find((author) => author.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  return found ? { id: found.id, name: found.name } : { name }
}

// A scan never preselects ebook: the person is holding a printed book.
export function formatHint(format, { scanned, allowed }) {
  if (!format || !allowed.includes(format)) return undefined
  if (scanned && format === 'ebook') return undefined
  return format
}

const present = (entries) => Object.fromEntries(entries.filter(([, value]) => value !== undefined && value !== null && value !== ''))

// The edition fields a lookup fills; format only when none is chosen yet.
export function editionFromLookup(record, { scanned, allowed, currentFormat }) {
  return present([
    ['format', currentFormat ? undefined : formatHint(record.format, { scanned, allowed })],
    ['publisher', record.publisher],
    ['published', record.published],
  ])
}

export function bookFromLookup(record, authors, options) {
  return present([
    ['title', record.title],
    ['author', authorFromLookup(record.authors, authors)],
    ['synopsis', record.synopsis],
    ...Object.entries(editionFromLookup(record, options)),
  ])
}

// The courtesy line names Google Books once a lookup shows it is configured.
export const creditLine = (record) => {
  const google = record?.sources?.google
  return google && google !== 'disabled' ? 'Book data from Open Library and Google Books' : 'Book data from Open Library'
}
