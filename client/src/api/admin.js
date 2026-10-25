/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { ApiError, request } from './request.js'

// Resolves to true when the session cookie is valid, false when the server answers 401.
export async function checkSession({ signal } = {}) {
  try {
    await request('/api/admin/session', { signal })
    return true
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return false
    throw err
  }
}

export const signIn = (password) => request('/api/admin/login', { method: 'POST', json: { password } })

export const signOut = () => request('/api/admin/logout', { method: 'POST' })

export const getSettings = ({ signal } = {}) => request('/api/admin/settings', { signal })

// A string sets a setting, null clears it; a key left out keeps its value.
export const saveSettings = (changes) => request('/api/admin/settings', { method: 'PUT', json: changes })

export const testService = (service) => request('/api/admin/settings/test', { method: 'POST', json: { service } })
