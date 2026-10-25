/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import path from 'node:path'
import { zipPackage } from 'roku-deploy'
import { renderImages } from './images.js'

const channel = path.resolve(import.meta.dirname, '..')
const dist = path.resolve(channel, '../dist')
const staging = path.join(dist, 'roku')
const COPIED = ['source', 'components', 'fonts']

function cleanBase(value) {
  const base = value.trim().replace(/\/+$/, '')
  return /^https?:\/\/[^/\s?#]+(\/[^\s?#]*)?$/i.test(base) ? base : null
}

function writeManifest(text, base) {
  const lines = text.split('\n')
  const at = lines.findIndex((line) => line.startsWith('hemlock_base_url='))
  if (at < 0) throw new Error('roku/manifest has no hemlock_base_url line')
  if (base) lines[at] = `hemlock_base_url=${base}`
  return { manifest: lines.join('\n'), base: lines[at].slice('hemlock_base_url='.length) }
}

async function build() {
  const raw = process.env.HEMLOCK_BASE_URL?.trim()
  const base = raw ? cleanBase(raw) : null
  if (raw && !base) throw new Error(`HEMLOCK_BASE_URL is not an http or https address: ${raw}`)

  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(staging, { recursive: true })
  for (const dir of COPIED) fs.cpSync(path.join(channel, dir), path.join(staging, dir), { recursive: true })
  const written = writeManifest(fs.readFileSync(path.join(channel, 'manifest'), 'utf8'), base)
  fs.writeFileSync(path.join(staging, 'manifest'), written.manifest)
  await renderImages(path.join(staging, 'images'))

  await zipPackage({ stagingDir: staging, outDir: dist, outFile: 'hemlock-roku' })
  const size = fs.statSync(path.join(dist, 'hemlock-roku.zip')).size
  console.log(`dist/hemlock-roku.zip, ${Math.round(size / 1024)} KB, for ${written.base}`)
}

build().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
