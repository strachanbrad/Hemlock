/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { config } from './config.js'
import { httpError } from './errors.js'

export const coversDir = path.join(config.dataDir, 'covers')
export const MAX_COVER_BYTES = 10 * 1024 * 1024
export const MAX_COVER_SIDE = 1600
const MAX_INPUT_PIXELS = 50_000_000

const COVER_NAME = /^[eb][1-9]\d*-[0-9a-f]{8}\.(jpg|png|webp)$/
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function imageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png'
  if (buffer.length >= 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  return null
}

// Resolves to { buffer, ext } as the cover is stored: a JPEG at most MAX_COVER_SIDE on its long side,
// turned upright, with no metadata. A JPEG that already fits and carries no EXIF, XMP or IPTC is kept
// byte for byte. Rejects with a 400 for anything else.
export async function prepareCover(buffer) {
  if (!imageType(buffer)) throw httpError(400, 'The cover must be a JPEG, PNG or WebP image')
  try {
    const image = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    const { format, width, height, exif, xmp, iptc } = await image.metadata()
    if (format === 'jpeg' && Math.max(width, height) <= MAX_COVER_SIDE && !exif && !xmp && !iptc) {
      // metadata() reads only the header; stats() decodes every pixel, so a truncated file is refused.
      await image.stats()
      return { buffer, ext: 'jpg' }
    }
    const output = await image
      .autoOrient()
      .resize(MAX_COVER_SIDE, MAX_COVER_SIDE, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()
    return { buffer: output, ext: 'jpg' }
  } catch {
    throw httpError(400, 'The cover could not be read as an image')
  }
}

export function deleteCover(filename) {
  if (!COVER_NAME.test(filename)) throw new Error(`Refusing to delete a cover named ${JSON.stringify(filename)}`)
  try {
    fs.unlinkSync(path.join(coversDir, filename))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}

const DOWNLOAD_TIMEOUT_MS = 10 * 1000
const MAX_REDIRECTS = 3
// Google Books answers a volume without a cover with this 1269-byte "image not available" PNG.
const GOOGLE_PLACEHOLDER_SHA256 = 'e3f8c414b288cbdf4e6d1e00eb6d3826157d10a5b5628b9318f726ea490eca12'
const COVER_STEM = /^[eb][1-9]\d*$/

class DownloadError extends Error {}

// A cover URL comes from the client, so the server fetches only the lookup sources' image hosts:
// Open Library (redirecting to archive.org), Google Books, and the Amazon and Goodreads images a
// Claude lookup finds on a listing.
const COVER_HOSTS = new Set(['covers.openlibrary.org', 'archive.org', 'books.google.com', 'm.media-amazon.com', 'images-na.ssl-images-amazon.com', 'i.gr-assets.com', 'images.gr-assets.com'])
const COVER_DOMAINS = ['.archive.org', '.images-amazon.com']

export function allowedCoverUrl(input) {
  let url
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const host = url.hostname
  return COVER_HOSTS.has(host) || COVER_DOMAINS.some((domain) => host.endsWith(domain)) ? url : null
}

// archive.org sends no Content-Length, so the cap is counted while the body streams.
async function readCapped(body) {
  const chunks = []
  let size = 0
  for await (const chunk of body) {
    size += chunk.byteLength
    if (size > MAX_COVER_BYTES) throw new DownloadError('larger than 10 MB')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const discard = (response) => response.body?.cancel().catch(() => {})

// Redirects are followed by hand so that every hop is checked against the allow-list.
async function download(start, { fetch, timeoutMs, userAgent }) {
  const signal = AbortSignal.timeout(timeoutMs)
  let url = allowedCoverUrl(start)
  if (!url) throw new DownloadError('not an https URL on an allowed host')
  for (let hop = 0; ; hop++) {
    const response = await fetch(url.href, {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': userAgent, Accept: 'image/jpeg, image/png, image/webp' },
    })
    if (response.status >= 300 && response.status < 400) {
      await discard(response)
      if (hop === MAX_REDIRECTS) throw new DownloadError(`more than ${MAX_REDIRECTS} redirects`)
      const location = response.headers.get('location')
      if (!location) throw new DownloadError('redirect without a Location')
      url = URL.canParse(location, url) ? allowedCoverUrl(new URL(location, url)) : null
      if (!url) throw new DownloadError(`redirected to a URL off the allow-list: ${location.slice(0, 120)}`)
      continue
    }
    if (!response.ok) {
      await discard(response)
      throw new DownloadError(`HTTP ${response.status}`)
    }
    if (Number(response.headers.get('content-length')) > MAX_COVER_BYTES) {
      await discard(response)
      throw new DownloadError('larger than 10 MB')
    }
    return response.body ? readCapped(response.body) : Buffer.alloc(0)
  }
}

async function writeCover(buffer, filename) {
  await fs.promises.mkdir(coversDir, { recursive: true })
  // The temp file stays in coversDir: a rename across mounts (PrivateTmp) fails with EXDEV.
  const temp = path.join(coversDir, `.${filename}.tmp`)
  try {
    await fs.promises.writeFile(temp, buffer, { flag: 'wx' })
    await fs.promises.rename(temp, path.join(coversDir, filename))
  } catch (err) {
    await fs.promises.rm(temp, { force: true })
    throw err
  }
  return filename
}

function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return 'an invalid URL'
  }
}

// `base` is 'e<edition id>' or 'b<book id>', as for writeCover() in coverFiles.js. Resolves to the file
// name, or to null after logging one line when anything fails; never rejects for an upstream problem.
export async function saveCoverFromUrl(url, base, { fetch = globalThis.fetch, timeoutMs = DOWNLOAD_TIMEOUT_MS, userAgent = config.userAgent, log = console.warn } = {}) {
  if (typeof base !== 'string' || !COVER_STEM.test(base)) throw new TypeError(`A cover needs 'e<edition id>' or 'b<book id>', not ${JSON.stringify(base)}`)

  try {
    const buffer = await download(url, { fetch, timeoutMs, userAgent })
    if (!imageType(buffer)) throw new DownloadError('not a JPEG, PNG or WebP image')
    if (crypto.createHash('sha256').update(buffer).digest('hex') === GOOGLE_PLACEHOLDER_SHA256) throw new DownloadError("Google's image-not-available placeholder")
    const cover = await prepareCover(buffer)
    return await writeCover(cover.buffer, `${base}-${crypto.randomBytes(4).toString('hex')}.${cover.ext}`)
  } catch (err) {
    log(`Cover not saved from ${hostOf(url)}: ${err.name === 'TimeoutError' ? `no answer in ${timeoutMs} ms` : err.message}`)
    return null
  }
}
