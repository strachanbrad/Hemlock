/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const repo = path.resolve(import.meta.dirname, '../..')
const fonts = path.join(repo, 'roku/fonts')
const clientImages = path.join(repo, 'client/src/images')

const INK = '#15121a'
const CREAM = '#efe6da'
const BRASS = '#c9a86a'

const read = (file) => fs.readFileSync(file, 'utf8')

// Icons are drawn white; the channel tints each Poster with blendColor.
const white = (svg) => svg.replaceAll('currentColor', '#ffffff').replaceAll('#000000', '#ffffff')
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
const square = (size) => ({ width: size, height: size, fit: 'contain', background: TRANSPARENT })

function backgroundSvg(width, height) {
  const corner = Math.hypot(width, height)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${width}" cy="0" r="${corner}">
      <stop offset="0" stop-color="#89023e" stop-opacity="0.14"/>
      <stop offset="0.45" stop-color="#89023e" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.4" r="1" gradientTransform="translate(0.5 0.4) scale(1.2 1) translate(-0.5 -0.4)">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="${INK}"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <rect width="100%" height="100%" fill="url(#vignette)"/>
</svg>`
}

// The cloth cover of display.css: a woven gradient with a spine shadow; the brass frame is drawn by the channel.
function clothSvg(width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="cloth" x1="0.33" y1="0" x2="0.67" y2="1">
      <stop offset="0" stop-color="#2c2232"/>
      <stop offset="1" stop-color="#1a1420"/>
    </linearGradient>
    <pattern id="warp" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="1" height="4" fill="#efe6da" fill-opacity="0.025"/>
    </pattern>
    <pattern id="weft" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <rect width="1" height="4" fill="#000000" fill-opacity="0.2"/>
    </pattern>
    <linearGradient id="spine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000000" stop-opacity="0.4"/>
      <stop offset="0.06" stop-color="#000000" stop-opacity="0.1"/>
      <stop offset="0.1" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#cloth)"/>
  <rect width="100%" height="100%" fill="url(#weft)"/>
  <rect width="100%" height="100%" fill="url(#warp)"/>
  <rect width="100%" height="100%" fill="url(#spine)"/>
</svg>`
}

async function text(value, fontFile, family, size, color) {
  const markup = `<span foreground="${color}">${value}</span>`
  const { data, info } = await sharp({
    text: { text: markup, font: `${family} ${size}`, fontfile: path.join(fonts, fontFile), rgba: true, dpi: 72 },
  }).png().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

async function wordmark(size) {
  const the = await text('The', 'CormorantGaramond-MediumItalic.otf', 'Cormorant Garamond Medium Italic', Math.round(size * 0.8), CREAM)
  const hemlock = await text('Hemlock', 'CormorantGaramond-SemiBold.otf', 'Cormorant Garamond SemiBold', size, CREAM)
  const gap = Math.round(size * 0.28)
  const width = the.width + gap + hemlock.width
  const height = Math.max(the.height, hemlock.height)
  const data = await sharp({ create: { width, height, channels: 4, background: TRANSPARENT } })
    .composite([
      { input: the.data, left: 0, top: height - the.height },
      { input: hemlock.data, left: the.width + gap, top: height - hemlock.height },
    ])
    .png()
    .toBuffer()
  return { data, width, height }
}

const logo = (height) => sharp(Buffer.from(read(path.join(repo, 'client/public/logo-cream.svg')))).resize({ height }).png().toBuffer({ resolveWithObject: true })

// The logo over the wordmark on the stage's ink, inside a brass hairline frame.
async function card(width, height, frame) {
  const logoHeight = Math.round(height * 0.5)
  const { data: logoData, info } = await logo(logoHeight)
  const mark = await wordmark(Math.round(height * 0.13))
  const gap = Math.round(height * 0.05)
  const top = Math.round((height - (logoHeight + gap + mark.height)) / 2)
  const inset = Math.round(height * frame)
  const hairline = Math.max(1, Math.round(height / 360))
  const border = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect x="${inset}" y="${inset}" width="${width - 2 * inset}" height="${height - 2 * inset}" fill="none" stroke="${BRASS}" stroke-opacity="0.45" stroke-width="${hairline}"/>
  </svg>`
  const layers = [
    { input: logoData, left: Math.round((width - info.width) / 2), top },
    { input: mark.data, left: Math.round((width - mark.width) / 2), top: top + logoHeight + gap },
  ]
  if (frame) layers.unshift({ input: Buffer.from(border) })
  return sharp(Buffer.from(backgroundSvg(width, height))).composite(layers).png()
}

const ICONS = {
  'star-filled': 'filledstar.svg',
  'star-empty': 'unfilledstar.svg',
  'chilli-filled': 'filledchili.svg',
  'chilli-empty': 'unfilledchili.svg',
  'knife-filled': 'filledknife.svg',
  'knife-empty': 'unfilledknife.svg',
  'book-open': 'bookopen.svg',
  'book-closed': 'bookclosed.svg',
}

export async function renderImages(outDir) {
  fs.mkdirSync(outDir, { recursive: true })
  const out = (name) => path.join(outDir, name)

  // Smooth gradients survive the Poster's 2x upscale, at a quarter of the file size.
  await sharp(Buffer.from(backgroundSvg(960, 540))).png().toFile(out('background.png'))
  await sharp(Buffer.from(clothSvg(605, 907))).jpeg({ quality: 90 }).toFile(out('cloth.jpg'))

  const umbel = white(read(path.join(clientImages, 'ornaments/umbel.svg')))
  await sharp(Buffer.from(umbel)).resize(square(58)).png().toFile(out('umbel.png'))
  await sharp(Buffer.from(umbel)).resize(square(29)).png().toFile(out('umbel-small.png'))
  for (const [name, file] of Object.entries(ICONS)) {
    await sharp(Buffer.from(white(read(path.join(clientImages, file))))).resize(square(36)).png().toFile(out(`${name}.png`))
  }

  await (await card(540, 405, 0.035)).toFile(out('icon-fhd.png'))
  await (await card(290, 218, 0.035)).toFile(out('icon-hd.png'))
  const splash = await (await card(1920, 1080, 0)).toBuffer()
  fs.writeFileSync(out('splash-fhd.png'), splash)
  await sharp(splash).resize(1280, 720).png().toFile(out('splash-hd.png'))
  await sharp(splash).resize(720, 480, { fit: 'cover' }).png().toFile(out('splash-sd.png'))
}
