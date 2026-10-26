/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

// cookie is the session's Cookie header, from startServer.
export function client(base, cookie) {
  const call = async (method, url, body) => {
    const init = { method, headers: cookie ? { Cookie: cookie } : {} }
    if (body instanceof FormData) init.body = body
    else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json'
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

// node:http rather than fetch, for localAddress: a client address on the loopback network, which the
// per-address counts tell apart. Answers the raw text too, for the tests that look for a secret in it.
export function send(base, method, url, { body, cookie, bearer, localAddress, headers: extra = {} } = {}) {
  const headers = { ...extra }
  if (cookie) headers.Cookie = cookie
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  const data = body === undefined ? undefined : JSON.stringify(body)
  if (data !== undefined) headers['Content-Type'] = 'application/json'
  return new Promise((resolve, reject) => {
    const request = http.request(base + url, { method, headers, localAddress }, (response) => {
      let text = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => (text += chunk))
      response.on('end', () => resolve({ status: response.statusCode, body: text ? JSON.parse(text) : null, headers: response.headers, text }))
    })
    request.on('error', reject)
    request.end(data)
  })
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
