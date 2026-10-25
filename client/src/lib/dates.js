/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

const pad = (n) => String(n).padStart(2, '0')
// The server's timestamps are SQLite datetime('now'): UTC, with no zone marker.
const SQLITE_UTC = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

export function localDate(utc) {
  const date = SQLITE_UTC.test(utc) ? new Date(`${utc.replace(' ', 'T')}Z`) : null
  if (!date || Number.isNaN(date.getTime())) return utc.slice(0, 10)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
