/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { errorMessage } from './request.js'

export const insertData = async (table, data) => {
  try {
    const response = await fetch(`/api/data/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) throw new Error(await errorMessage(response, 'Failed to insert data'))
    return await response.json()
  } catch (error) {
    console.error('Error during data insertion:', error)
    throw error
  }
}

export const deleteData = async (table, id) => {
  try {
    const response = await fetch(`/api/data/${table}/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(await errorMessage(response, 'Failed to delete data'))
    return await response.json()
  } catch (error) {
    console.error('Error during data deletion:', error)
    throw error
  }
}
