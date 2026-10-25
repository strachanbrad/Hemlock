/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { httpError } from '../errors.js'

const bindable = (column, value) => {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value === null || typeof value === 'string' || typeof value === 'number') return value
  throw httpError(400, `Invalid value for ${column}`)
}

// Column names come from the caller's list, never from the body.
export function pickFields(body, columns) {
  const source = body ?? {}
  return columns
    .filter((column) => Object.hasOwn(source, column))
    .map((column) => [column, bindable(column, source[column])])
}
