/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Overlapping writes to one record: only the newest request's outcome is applied, so a
// slow response to an earlier tap never undoes a later one.
export function createLatest() {
  const newest = new Map()
  return {
    start(key) {
      const ticket = (newest.get(key) ?? 0) + 1
      newest.set(key, ticket)
      return () => newest.get(key) === ticket
    },
  }
}
