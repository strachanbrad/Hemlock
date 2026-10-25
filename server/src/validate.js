/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { allowedCoverUrl } from './covers.js'
import { httpError } from './errors.js'
import { toIsbn13 } from './lib/isbn.js'

export const FORMATS = ['hardcover', 'paperback', 'ebook']
export const PHYSICAL = new Set(['hardcover', 'paperback'])

const MAX_NAME = 200
const MAX_TITLE = 500
const MAX_SYNOPSIS = 20000
const MAX_URL = 2048
const PUBLISHED = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/

const invalid = (message) => httpError(400, message)
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function object(value, what) {
  if (!isObject(value)) throw invalid(`${what} must be a JSON object`)
  return value
}

function knownKeys(payload, allowed, what) {
  const unknown = Object.keys(payload).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) throw invalid(`Unknown field in ${what}: ${unknown.join(', ')}`)
}

export const collapse = (text) => text.trim().replace(/\s+/g, ' ')

function name(value, field, max) {
  if (typeof value !== 'string') throw invalid(`${field} must be a string`)
  const text = collapse(value)
  if (text === '') throw invalid(`${field} must not be empty`)
  if (text.length > max) throw invalid(`${field} is longer than ${max} characters`)
  return text
}

function rating(value, field) {
  if (!Number.isInteger(value) || value < 0 || value > 5) throw invalid(`${field} must be a whole number from 0 to 5`)
  return value
}

function flag(value, field) {
  if (value === true || value === 1) return 1
  if (value === false || value === 0) return 0
  throw invalid(`${field} must be true or false`)
}

export function id(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) throw invalid(`${field} must be a positive whole number`)
  return value
}

function synopsis(value) {
  if (typeof value !== 'string') throw invalid('synopsis must be a string')
  const text = value.replace(/\r\n?/g, '\n').trim()
  if (text.length > MAX_SYNOPSIS) throw invalid(`synopsis is longer than ${MAX_SYNOPSIS} characters`)
  return text
}

function optionalName(value, field, max) {
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null
  return name(value, field, max)
}

function isbn(value) {
  if (value === null || value === '') return null
  if (typeof value !== 'string') throw invalid('isbn must be a string')
  const isbn13 = toIsbn13(value)
  if (!isbn13) throw invalid(`${JSON.stringify(value)} is not a valid ISBN-10 or ISBN-13`)
  return isbn13
}

function published(value) {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !PUBLISHED.test(value)) throw invalid('published must be YYYY, YYYY-MM or YYYY-MM-DD')
  // PUBLISHED allows day 31 in every month; Date.UTC rolls a day the month lacks into the next.
  const [year, month, day] = value.split('-').map(Number)
  if (day !== undefined && new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) {
    throw invalid(`published ${JSON.stringify(value)} is not a real date`)
  }
  return value
}

// Refused here, before any request, unless it is on the download allow-list.
function coverUrl(value) {
  const url = typeof value === 'string' && value.length <= MAX_URL ? allowedCoverUrl(value) : null
  if (!url) throw invalid('cover_from_url must be an https URL from Open Library, archive.org or Google Books')
  return url.href
}

function removeCover(value) {
  if (value !== null) throw invalid('cover may only be null, which removes the cover')
  return true
}

const BOOK_FIELDS = {
  title: (value) => name(value, 'title', MAX_TITLE),
  author_id: (value) => id(value, 'author_id'),
  author_name: (value) => name(value, 'author_name', MAX_NAME),
  synopsis,
  star_rating: (value) => rating(value, 'star_rating'),
  spice_rating: (value) => rating(value, 'spice_rating'),
  gore_rating: (value) => rating(value, 'gore_rating'),
  read: (value) => flag(value, 'read'),
  wishlist: (value) => flag(value, 'wishlist'),
  cover_from_url: coverUrl,
}

const EDITION_FIELDS = {
  format: (value) => {
    if (!FORMATS.includes(value)) throw invalid(`format must be one of ${FORMATS.join(', ')}`)
    return value
  },
  isbn,
  publisher: (value) => optionalName(value, 'publisher', MAX_NAME),
  published,
  cover_from_url: coverUrl,
}

function fields(payload, checks) {
  const out = {}
  for (const [key, check] of Object.entries(checks)) {
    if (Object.hasOwn(payload, key)) out[key] = check(payload[key])
  }
  return out
}

// Returns the payload with every value in its stored form (booleans as 0/1, ISBN-13, collapsed names).
// `cover: null` on an update becomes `remove_cover: true`.
export function bookPayload(body, { create }) {
  const payload = object(body, 'The book')
  knownKeys(payload, [...Object.keys(BOOK_FIELDS), create ? 'edition' : 'cover'], 'the book')
  const out = fields(payload, BOOK_FIELDS)

  const authors = ['author_id', 'author_name'].filter((key) => Object.hasOwn(out, key))
  if (authors.length > 1) throw invalid('Send author_id or author_name, not both')
  if (create) {
    if (out.title === undefined) throw invalid('title is required')
    if (authors.length === 0) throw invalid('author_id or author_name is required')
    if (Object.hasOwn(payload, 'edition')) out.edition = editionPayload(payload.edition, { create: true })
  } else if (Object.hasOwn(payload, 'cover')) {
    out.remove_cover = removeCover(payload.cover)
  }
  return out
}

export function editionPayload(body, { create }) {
  const payload = object(body, 'The edition')
  knownKeys(payload, [...Object.keys(EDITION_FIELDS), ...(create ? [] : ['cover'])], 'the edition')
  const out = fields(payload, EDITION_FIELDS)
  if (create && out.format === undefined) throw invalid('format is required')
  if (!create && Object.hasOwn(payload, 'cover')) out.remove_cover = removeCover(payload.cover)
  return out
}

export function authorPayload(body) {
  const payload = object(body, 'The author')
  knownKeys(payload, ['name'], 'the author')
  if (!Object.hasOwn(payload, 'name')) throw invalid('name is required')
  return { name: name(payload.name, 'name', MAX_NAME) }
}

const QUERY_FLAGS = new Map([['1', 1], ['true', 1], ['0', 0], ['false', 0]])
const LIST_FILTERS = ['q', 'author_id', 'format', 'owned', 'wishlist', 'read']

export function listFilters(query) {
  knownKeys(query, LIST_FILTERS, 'the filters')
  const value = (key) => {
    const raw = query[key]
    if (raw === undefined) return undefined
    if (typeof raw !== 'string') throw invalid(`${key} is given more than once`)
    return raw
  }
  const queryFlag = (key) => {
    const raw = value(key)
    if (raw === undefined) return null
    if (!QUERY_FLAGS.has(raw)) throw invalid(`${key} must be 1, 0, true or false`)
    return QUERY_FLAGS.get(raw)
  }

  const q = collapse(value('q') ?? '')
  const authorId = value('author_id')
  if (authorId !== undefined && !/^[1-9]\d{0,15}$/.test(authorId)) throw invalid('author_id must be a positive whole number')
  const format = value('format') ?? null
  if (format !== null && format !== 'physical' && !FORMATS.includes(format)) {
    throw invalid(`format must be one of ${[...FORMATS, 'physical'].join(', ')}`)
  }

  return {
    like: q === '' ? null : `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
    isbn: q === '' ? null : toIsbn13(q),
    author_id: authorId === undefined ? null : Number(authorId),
    format,
    owned: queryFlag('owned'),
    wishlist: queryFlag('wishlist'),
    read: queryFlag('read'),
  }
}

export function pathId(raw, what) {
  if (!/^[1-9]\d{0,15}$/.test(raw)) throw httpError(404, `${what} not found`)
  return Number(raw)
}
