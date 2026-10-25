/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

// server/src/lib/isbn.js and client/src/lib/isbn.js are identical; a server test compares them.

const LABEL = /^ISBN(?:-1[03])?:?/i

export function normalizeIsbn(input) {
  return typeof input === 'string' ? input.trim().replace(LABEL, '').replace(/[\s-]/g, '').toUpperCase() : ''
}

export function isValidIsbn10(s) {
  if (!/^\d{9}[\dX]$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) sum += (10 - i) * (s[i] === 'X' ? 10 : Number(s[i]))
  return sum % 11 === 0
}

function checkDigit13(first12) {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 ? 3 : 1)
  return String((10 - (sum % 10)) % 10)
}

// The 978/979 prefix rejects an ISSN or a grocery EAN whose checksum happens to be valid.
export function isValidIsbn13(s) {
  return /^97[89]\d{10}$/.test(s) && checkDigit13(s) === s[12]
}

export function isbn10To13(s) {
  const first12 = '978' + s.slice(0, 9)
  return first12 + checkDigit13(first12)
}

// 979 ISBNs have no ISBN-10.
export function isbn13To10(s) {
  if (!isValidIsbn13(s) || !s.startsWith('978')) return null
  const core = s.slice(3, 12)
  let sum = 0
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(core[i])
  const c = (11 - (sum % 11)) % 11
  return core + (c === 10 ? 'X' : String(c))
}

export function toIsbn13(input) {
  const s = normalizeIsbn(input)
  if (isValidIsbn13(s)) return s
  if (isValidIsbn10(s)) return isbn10To13(s)
  return null
}
