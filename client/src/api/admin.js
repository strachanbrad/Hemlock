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

export const listUsers = ({ signal } = {}) => request('/api/admin/users', { signal })

export const addUser = (name, password) => request('/api/admin/users', { method: 'POST', json: { name, password } })

export const setUserPassword = (id, password) => request(`/api/admin/users/${id}/password`, { method: 'PUT', json: { password } })

export const removeUser = (id) => request(`/api/admin/users/${id}`, { method: 'DELETE' })

export const listDevices = ({ signal } = {}) => request('/api/admin/devices', { signal })

export const pairDevice = (code, name) => request('/api/admin/devices', { method: 'POST', json: { code, name } })

export const removeDevice = (id) => request(`/api/admin/devices/${id}`, { method: 'DELETE' })
