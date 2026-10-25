/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

export const fetchAuthors = async (setAuthors) => {
  try {
    const response = await fetch('/api/authors')
    if (response.ok) {
      const data = await response.json()
      setAuthors(data.data || [])
    } else {
      console.error('Failed to fetch authors:', response.statusText)
      setAuthors([])
    }
  } catch (error) {
    console.error('Network error when fetching authors:', error)
    setAuthors([])
  }
}
