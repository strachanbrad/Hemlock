/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

const GOOGLE = 'google'
const OPEN_LIBRARY = 'open_library'
const OPEN_LIBRARY_WORK = 'open_library_work'

export function pick(record, fields) {
  if (!record || typeof record !== 'object') return null
  return Object.fromEntries(fields.filter((field) => record[field] !== undefined).map((field) => [field, record[field]]))
}

const head = (list) => (Array.isArray(list) ? list[0] : null)

// Open Library sends some names decomposed (e + U+0308); NFC makes them match the same name typed.
export const clean = (value) => (typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() || null : null)

function names(list) {
  if (!Array.isArray(list)) return null
  const seen = new Set()
  const result = []
  for (const value of list) {
    const name = clean(value)
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase())
      result.push(name)
    }
  }
  return result.length > 0 ? result : null
}

export const normalizeText = (text) => text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

// Open Library gives a description as a string or as { type: '/type/text', value }.
export function normalizeDescription(description) {
  const text = typeof description === 'string' ? description : description?.value
  return typeof text === 'string' ? normalizeText(text) || null : null
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntity(entity, name) {
  if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? entity
  const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity
}

export function stripHtml(html) {
  if (typeof html !== 'string') return null
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decodeEntity)
  return normalizeText(text) || null
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const pad = (n) => String(n).padStart(2, '0')

function monthNumber(name) {
  const lower = name.toLowerCase()
  const index = lower.length >= 3 ? MONTHS.findIndex((month) => month.startsWith(lower)) : -1
  return index === -1 ? null : index + 1
}

function formatDate(year, month, day) {
  if (!(year >= 1000 && year <= 2099)) return null
  if (month === undefined) return String(year)
  if (!(month >= 1 && month <= 12)) return null
  if (day === undefined) return `${year}-${pad(month)}`
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? `${year}-${pad(month)}-${pad(day)}` : null
}

const DATE_FORMATS = [
  [/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/, (m) => [+m[1], m[2] && +m[2], m[3] && +m[3]]],
  [/^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/i, (m) => [+m[3], monthNumber(m[1]), +m[2]]],
  [/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?,? (\d{4})$/i, (m) => [+m[3], monthNumber(m[2]), +m[1]]],
  [/^([a-z]+)\.?,? (\d{4})$/i, (m) => [+m[2], monthNumber(m[1])]],
]

// YYYY, YYYY-MM or YYYY-MM-DD; anything else unambiguous keeps only its year (16/06/2024 is 2024).
export function normalizeDate(input) {
  if (typeof input !== 'string') return null
  const text = input.trim().replace(/\s+/g, ' ')
  for (const [pattern, parts] of DATE_FORMATS) {
    const match = pattern.exec(text)
    if (!match) continue
    const [year, month, day] = parts(match)
    if (month === null) break
    const date = formatDate(year, month || undefined, day || undefined)
    if (date) return date
    break
  }
  return /(?<!\d)(1\d{3}|20\d{2})(?!\d)/.exec(text)?.[1] ?? null
}

const FORMATS = [
  ['hardcover', /hardcover|hardback|library binding/i],
  ['paperback', /paperback|mass market|trade paper|softcover|perfect/i],
  ['ebook', /ebook|e-book|kindle|epub|digital/i],
]

export function mapFormat(physicalFormat) {
  if (typeof physicalFormat !== 'string') return null
  return FORMATS.find(([, pattern]) => pattern.test(physicalFormat))?.[0] ?? null
}

const coverId = (id) => (Number.isSafeInteger(id) && id > 0 ? id : null)
const firstCover = (covers) => (Array.isArray(covers) ? (covers.map(coverId).find((id) => id !== null) ?? null) : null)
export const coverUrl = (id) => (id === null ? null : `https://covers.openlibrary.org/b/id/${id}-L.jpg`)

// zoom=1 is the one size Google serves reliably; edge=curl paints a page curl onto the image.
export function googleThumbnail(imageLinks) {
  if (typeof imageLinks?.thumbnail !== 'string') return null
  let url
  try {
    url = new URL(imageLinks.thumbnail)
  } catch {
    return null
  }
  if (url.hostname !== 'books.google.com') return null
  url.protocol = 'https:'
  url.port = ''
  url.searchParams.delete('edge')
  return url.href
}

export function merge(isbn, google, openLibrary) {
  const volume = (google.status === 'ok' && google.volume) || {}
  const { doc = {}, searchEdition = null, edition = null, work = null } = openLibrary.status === 'ok' ? openLibrary : {}
  const fields = {}
  const choose = (field, candidates) => {
    for (const [value, source] of candidates) {
      if (value !== null && value !== undefined) {
        fields[field] = source
        return value
      }
    }
    return null
  }

  const record = {
    isbn,
    title: choose('title', [
      [clean(volume.title), GOOGLE],
      [clean(edition?.title) ?? clean(searchEdition?.title), OPEN_LIBRARY],
      [clean(doc.title) ?? clean(work?.title), OPEN_LIBRARY_WORK],
    ]),
    authors: choose('authors', [
      [names(volume.authors), GOOGLE],
      [names(doc.author_name), OPEN_LIBRARY],
    ]) ?? [],
    publisher: choose('publisher', [
      [clean(volume.publisher), GOOGLE],
      [clean(head(edition?.publishers)) ?? clean(head(searchEdition?.publisher)), OPEN_LIBRARY],
    ]),
    published: choose('published', [
      [normalizeDate(volume.publishedDate), GOOGLE],
      [normalizeDate(edition?.publish_date) ?? normalizeDate(head(searchEdition?.publish_date)), OPEN_LIBRARY],
    ]),
    synopsis: choose('synopsis', [
      [stripHtml(volume.description), GOOGLE],
      [normalizeDescription(edition?.description), OPEN_LIBRARY],
      [normalizeDescription(work?.description), OPEN_LIBRARY_WORK],
    ]),
    format: choose('format', [[mapFormat(edition?.physical_format), OPEN_LIBRARY]]),
    cover_url: choose('cover_url', [
      [coverUrl(firstCover(edition?.covers) ?? coverId(searchEdition?.cover_i)), OPEN_LIBRARY],
      [googleThumbnail(volume.imageLinks), GOOGLE],
      [coverUrl(coverId(doc.cover_i) ?? firstCover(work?.covers)), OPEN_LIBRARY_WORK],
    ]),
  }
  if (record.synopsis === null && openLibrary.partial) fields.synopsis = 'failed'
  return { ...record, sources: { google: google.status, open_library: openLibrary.status, fields } }
}

export function answer(isbn, google, openLibrary) {
  const statuses = [google.status, openLibrary.status]
  if (statuses.includes('ok')) return { status: 200, body: merge(isbn, google, openLibrary) }
  if (statuses.includes('failed')) return { status: 502, body: { error: 'No book source answered; try again later' } }
  return { status: 404, body: { error: `No book source knows ISBN ${isbn}` } }
}
