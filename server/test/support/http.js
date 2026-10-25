/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import path from 'node:path'

export function client(base) {
  const call = async (method, url, body) => {
    const init = { method }
    if (body instanceof FormData) init.body = body
    else if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' }
      init.body = typeof body === 'string' ? body : JSON.stringify(body)
    }
    const response = await fetch(base + url, init)
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }
  return {
    get: (url) => call('GET', url),
    post: (url, body) => call('POST', url, body),
    patch: (url, body) => call('PATCH', url, body),
    del: (url) => call('DELETE', url),
  }
}

export function multipart(data, cover, { type = 'image/jpeg', filename = 'cover.jpg', parts = {} } = {}) {
  const form = new FormData()
  if (data !== undefined) form.append('data', typeof data === 'string' ? data : JSON.stringify(data))
  if (cover) form.append('cover', new Blob([cover], { type }), filename)
  for (const [name, value] of Object.entries(parts)) form.append(name, value)
  return form
}

export const coverFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [])

export function placeCover(dir, filename, bytes) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, filename), bytes)
}

export function emptyLibrary(db, dir) {
  db.exec('DELETE FROM editions; DELETE FROM books; DELETE FROM authors;')
  fs.rmSync(dir, { recursive: true, force: true })
}
