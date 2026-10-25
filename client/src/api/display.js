/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { errorMessage } from './request.js'

export async function fetchDisplayBooks(filter, { signal } = {}) {
  const query = filter ? `?${new URLSearchParams({ filter })}` : ''
  const response = await fetch(`/api/display${query}`, { signal })
  if (!response.ok) throw new Error(await errorMessage(response, 'Cannot load the books to display'))
  return response.json()
}
