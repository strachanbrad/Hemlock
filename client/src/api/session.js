/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { ApiError, request } from './request.js'

export const login = (name, password) => request('/api/login', { method: 'POST', json: { name, password } })

export const logout = () => request('/api/logout', { method: 'POST' })

// Resolves to { name } when this browser is signed in, null when the server answers 401.
export async function session({ signal } = {}) {
  try {
    return await request('/api/session', { signal })
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err
  }
}
