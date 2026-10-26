/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { request } from './request.js'

export function fetchDisplayBooks(filter, { signal } = {}) {
  const query = filter ? `?${new URLSearchParams({ filter })}` : ''
  return request(`/api/display${query}`, { signal })
}
