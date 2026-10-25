/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

// The same cap as the server's MAX_COVER_SIDE (server/src/covers.js).
export const MAX_COVER_SIDE = 1600

export function scaledSize(width, height, max = MAX_COVER_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

// A phone photo is several megabytes; scaling it here keeps the upload small.
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
    const context = canvas.getContext('2d')
    // A JPEG has no transparency; white behind it matches what the server does.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    return blob ? new File([blob], 'cover.jpg', { type: 'image/jpeg' }) : file
  } finally {
    bitmap.close()
  }
}
