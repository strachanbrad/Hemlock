/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it } from 'vitest'
import { authorFromLookup, bookFromLookup, creditLine, editionFromLookup, formatHint, fromClaude, sourceHost } from '../src/lib/prefill.js'

const AUTHORS = [{ id: 3, name: 'Emily Brontë' }, { id: 7, name: 'Caroline Peckham & Susanne Valenti' }]
const ALL = ['hardcover', 'paperback', 'ebook']
const RECORD = {
  isbn: '9780553212587',
  title: 'Wuthering Heights',
  authors: ['EMILY BRONTË'],
  publisher: 'Bantam Books',
  published: '1981-03',
  synopsis: 'Moors.',
  format: 'paperback',
  cover_url: 'https://covers.openlibrary.org/b/id/14839277-L.jpg',
  sources: { google: 'disabled', open_library: 'ok', fields: {} },
}

describe('authorFromLookup', () => {
  it('matches an existing author without regard to case', () => {
    expect(authorFromLookup(['EMILY BRONTË'], AUTHORS)).toEqual({ id: 3, name: 'Emily Brontë' })
  })

  it('joins co-authors with " & " before matching', () => {
    expect(authorFromLookup(['Caroline Peckham', 'Susanne  Valenti'], AUTHORS)).toEqual({ id: 7, name: 'Caroline Peckham & Susanne Valenti' })
  })

  it('offers an unknown name as a new author, and nothing for no name', () => {
    expect(authorFromLookup(['Gigi Styx'], AUTHORS)).toEqual({ name: 'Gigi Styx' })
    expect(authorFromLookup([], AUTHORS)).toBeUndefined()
  })
})

describe('formatHint', () => {
  it('never preselects ebook after a scan, but does for a typed ISBN', () => {
    expect(formatHint('ebook', { scanned: true, allowed: ALL })).toBeUndefined()
    expect(formatHint('ebook', { scanned: false, allowed: ALL })).toBe('ebook')
    expect(formatHint('hardcover', { scanned: true, allowed: ALL })).toBe('hardcover')
  })

  it('keeps to the formats the form offers', () => {
    expect(formatHint('ebook', { scanned: false, allowed: ['hardcover', 'paperback'] })).toBeUndefined()
    expect(formatHint(null, { scanned: false, allowed: ALL })).toBeUndefined()
  })
})

describe('bookFromLookup', () => {
  it('fills title, author, synopsis, publisher, published and the format hint', () => {
    expect(bookFromLookup(RECORD, AUTHORS, { scanned: true, allowed: ALL, currentFormat: undefined })).toEqual({
      title: 'Wuthering Heights',
      author: { id: 3, name: 'Emily Brontë' },
      synopsis: 'Moors.',
      format: 'paperback',
      publisher: 'Bantam Books',
      published: '1981-03',
    })
  })

  it('leaves a chosen format and every field the lookup lacks alone', () => {
    const sparse = { ...RECORD, synopsis: null, publisher: null, published: null, authors: [] }
    expect(bookFromLookup(sparse, AUTHORS, { scanned: false, allowed: ALL, currentFormat: 'hardcover' })).toEqual({ title: 'Wuthering Heights' })
  })
})

describe('editionFromLookup', () => {
  it('fills the edition fields for a purchase, physical formats only', () => {
    expect(editionFromLookup({ ...RECORD, format: 'ebook' }, { scanned: false, allowed: ['hardcover', 'paperback'] })).toEqual({
      publisher: 'Bantam Books',
      published: '1981-03',
    })
  })
})

describe('creditLine', () => {
  it('names Google Books only when a lookup shows it is configured', () => {
    expect(creditLine(null)).toBe('Book data from Open Library')
    expect(creditLine(RECORD)).toBe('Book data from Open Library')
    expect(creditLine({ ...RECORD, sources: { ...RECORD.sources, google: 'not_found' } })).toBe('Book data from Open Library and Google Books')
  })

  it('names a cover taken from Barnes & Noble or Amazon, and no catalogue cover', () => {
    const coverFrom = (cover_url, google = 'disabled') => creditLine({ ...RECORD, sources: { ...RECORD.sources, google, fields: { ...RECORD.sources.fields, cover_url } } })
    expect(coverFrom('barnes_noble')).toBe('Book data from Open Library; cover from Barnes & Noble')
    expect(coverFrom('amazon', 'ok')).toBe('Book data from Open Library and Google Books; cover from Amazon')
    for (const source of ['open_library', 'open_library_work', 'google', undefined]) expect(coverFrom(source)).toBe('Book data from Open Library')
  })
})

describe('sourceHost', () => {
  it("names a listing's host without www.", () => {
    expect(sourceHost('https://www.amazon.com/dp/1969253096')).toBe('amazon.com')
    expect(sourceHost('https://bookshop.org/p/books/x')).toBe('bookshop.org')
    expect(sourceHost('https://www.goodreads.com/book/show/1')).toBe('goodreads.com')
    expect(sourceHost(null)).toBeNull()
    expect(sourceHost('not a url')).toBeNull()
  })

  it('tells a Claude record from a catalogue one', () => {
    expect(fromClaude({ sources: { anthropic: 'ok' } })).toBe(true)
    expect(fromClaude({ sources: { anthropic: 'disabled', open_library: 'ok' } })).toBe(false)
    expect(fromClaude(null)).toBe(false)
  })
})
