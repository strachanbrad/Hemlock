/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

export const MAX_COVER_SIDE = 1200

export function scaledSize(width, height, max = MAX_COVER_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

// A phone photo is several megabytes; a cover never needs more than MAX_COVER_SIDE pixels.
// Anything the browser cannot decode goes up unchanged and the server judges it.
export async function resizeCover(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }
  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height)
    if (width === bitmap.width && height === bitmap.height) return file
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    return blob ? new File([blob], 'cover.jpg', { type: 'image/jpeg' }) : file
  } finally {
    bitmap.close()
  }
}
