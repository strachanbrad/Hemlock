/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

export async function errorMessage(response, fallback) {
  const text = await response.text().catch(() => '')
  try {
    const { error } = JSON.parse(text)
    if (typeof error === 'string' && error) return error
  } catch {
    // nginx answers 413 and 502 with an HTML body.
  }
  return `${fallback} (HTTP ${response.status})`
}
