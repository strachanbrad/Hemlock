/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

export const FILTER_LABELS = {
  format: { physical: 'Physical', hardcover: 'Hardcover', paperback: 'Paperback', ebook: 'Ebook' },
  owned: { 1: 'Owned', 0: 'Wishlist only' },
  wishlist: { 1: 'On the wishlist' },
  read: { 1: 'Read', 0: 'Unread' },
}

// Object keys that look like integers sort first, so the display order is listed apart.
export const FILTER_ORDER = {
  format: ['physical', 'hardcover', 'paperback', 'ebook'],
  owned: ['1', '0'],
  wishlist: ['1'],
  read: ['1', '0'],
}

export const SORTS = { title: 'Title', author: 'Author', stars: 'Stars', spice: 'Spice', gore: 'Gore', added: 'Recently added' }

const CHOICE_KEYS = Object.keys(FILTER_LABELS)
const API_KEYS = [...CHOICE_KEYS, 'author_id']

export const VIEWS = ['list', 'flow']

export const EMPTY_FILTERS = { q: '', format: null, owned: null, wishlist: null, read: null, author_id: null, sort: 'title', view: null }

// Unknown or malformed values in the address are ignored rather than sent to the server.
export function filtersFromSearch(params) {
  const filters = { ...EMPTY_FILTERS, q: params.get('q') ?? '' }
  for (const key of CHOICE_KEYS) {
    const value = params.get(key)
    if (value !== null && Object.hasOwn(FILTER_LABELS[key], value)) filters[key] = value
  }
  const authorId = params.get('author_id')
  if (authorId && /^[1-9]\d*$/.test(authorId)) filters.author_id = authorId
  const sort = params.get('sort')
  if (sort && Object.hasOwn(SORTS, sort)) filters.sort = sort
  const view = params.get('view')
  if (VIEWS.includes(view)) filters.view = view
  return filters
}

// The q text is kept as typed, so a debounced update never eats a trailing space.
export function searchFromFilters(filters) {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  for (const key of API_KEYS) if (filters[key] !== null) params.set(key, filters[key])
  if (filters.sort !== 'title') params.set('sort', filters.sort)
  if (filters.view) params.set('view', filters.view)
  return params.toString()
}

export function apiQuery(filters) {
  const params = new URLSearchParams()
  const q = filters.q.trim()
  if (q) params.set('q', q)
  for (const key of API_KEYS) if (filters[key] !== null) params.set(key, filters[key])
  return params.toString()
}

export const activeFilterCount = (filters) => API_KEYS.filter((key) => filters[key] !== null).length

export const isWishlist = (filters) => filters.wishlist === '1'

const byText = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })
export const byTitle = (a, b) => byText(a.title, b.title) || a.id - b.id
export const byAuthor = (a, b) => byText(a.author.name, b.author.name) || byTitle(a, b)
const highestFirst = (field) => (a, b) => b[field] - a[field] || byTitle(a, b)

const COMPARE = {
  title: byTitle,
  author: byAuthor,
  stars: highestFirst('star_rating'),
  spice: highestFirst('spice_rating'),
  gore: highestFirst('gore_rating'),
  added: (a, b) => byText(b.created_at, a.created_at) || b.id - a.id,
}

export const sortBooks = (books, sort) => [...books].sort(COMPARE[sort] ?? byTitle)
