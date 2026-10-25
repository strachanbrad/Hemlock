/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

export const FILTERS = ['all', 'read', 'unread', 'owned']
export const DEFAULT_SECONDS = 10
export const MIN_SECONDS = 5
export const MAX_SECONDS = 3600

export function readOptions(search) {
  const params = new URLSearchParams(search)
  const raw = params.get('seconds')
  const parsed = raw === null || raw.trim() === '' ? NaN : Number(raw)
  const seconds = Number.isFinite(parsed) ? Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, parsed)) : DEFAULT_SECONDS
  const filter = params.get('filter')
  return {
    seconds,
    ratings: params.get('ratings') === 'all',
    filter: FILTERS.includes(filter) ? filter : null,
  }
}

// The slide at time t is (anchorIndex + floor((t - anchorAt) / interval)) mod n; a paused show reads pausedAt.
export function createShow(interval, t) {
  return { books: [], interval, anchorAt: t, anchorIndex: 0, pausedAt: null }
}

function slotOf(show, t) {
  return Math.floor(((show.pausedAt ?? t) - show.anchorAt) / show.interval)
}

function reanchor(show, t, index) {
  show.anchorAt = t
  show.anchorIndex = index
  if (show.pausedAt != null) show.pausedAt = t
}

export function currentIndex(show, t) {
  const n = show.books.length
  if (n === 0) return -1
  let slot = slotOf(show, t)
  if (slot < 0) {
    // The clock moved backwards.
    reanchor(show, t, show.anchorIndex)
    slot = 0
  }
  return (show.anchorIndex + slot) % n
}

// Keeps the book on screen, matched by id, and its remaining time; a deleted book yields its position.
export function applyBooks(show, books, t) {
  const i = currentIndex(show, t)
  const slotStart = show.anchorAt + Math.max(0, slotOf(show, t)) * show.interval
  let keep = 0
  if (i >= 0 && books.length) {
    const k = books.findIndex((book) => book.id === show.books[i].id)
    keep = k >= 0 ? k : i % books.length
  }
  show.books = books
  show.anchorAt = i >= 0 ? slotStart : t
  show.anchorIndex = keep
  if (i < 0 && show.pausedAt != null) show.pausedAt = t
}

export function step(show, t, delta) {
  const n = show.books.length
  if (n) reanchor(show, t, (((currentIndex(show, t) + delta) % n) + n) % n)
}

export function togglePause(show, t) {
  if (show.pausedAt == null) {
    show.pausedAt = t
  } else {
    show.anchorAt += t - show.pausedAt
    show.pausedAt = null
  }
}
