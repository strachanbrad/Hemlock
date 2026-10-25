/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { isbn10To13, isbn13To10, isValidIsbn10, isValidIsbn13, normalizeIsbn, toIsbn13 } from '../src/lib/isbn.js'

// Pairs from Open Library records that carry both forms.
const PAIRS = [
  ['0553212583', '9780553212587'],
  ['015602943X', '9780156029438'],
  ['014043089X', '9780140430899'],
  ['0060883286', '9780060883287'],
  ['1853260622', '9781853260629'],
  ['0140449124', '9780140449129'],
]

describe('isbn', () => {
  it('is the same file on the server and the client', () => {
    const server = fs.readFileSync(path.join(import.meta.dirname, '../src/lib/isbn.js'))
    const client = fs.readFileSync(path.join(import.meta.dirname, '../../client/src/lib/isbn.js'))
    assert.ok(server.equals(client), 'server/src/lib/isbn.js and client/src/lib/isbn.js differ')
  })

  it('converts between ISBN-10 and ISBN-13 both ways', () => {
    for (const [isbn10, isbn13] of PAIRS) {
      assert.ok(isValidIsbn10(isbn10), isbn10)
      assert.ok(isValidIsbn13(isbn13), isbn13)
      assert.equal(isbn10To13(isbn10), isbn13)
      assert.equal(isbn13To10(isbn13), isbn10)
      assert.equal(toIsbn13(isbn10), isbn13)
      assert.equal(toIsbn13(isbn13), isbn13)
    }
  })

  it('has no ISBN-10 for a 979 ISBN', () => {
    assert.ok(isValidIsbn13('9798844472251'))
    assert.equal(isbn13To10('9798844472251'), null)
  })

  it('strips labels, spaces and hyphens', () => {
    assert.equal(normalizeIsbn(' ISBN-13: 978-0-306-40615-7 '), '9780306406157')
    assert.equal(toIsbn13('ISBN-10: 0-306-40615-2'), '9780306406157')
    assert.equal(toIsbn13('ISBN 978-0-306-40615-7'), '9780306406157')
    assert.equal(toIsbn13('015602943x'), '9780156029438')
    assert.equal(normalizeIsbn(9780306406157), '')
  })

  it('rejects a bad check digit, a misplaced X and non-book EANs', () => {
    assert.equal(toIsbn13('9781471132191'), null)
    assert.equal(toIsbn13('0X56029438'), null)
    assert.equal(isValidIsbn13('9771234567003'), false, 'an ISSN with a valid checksum')
    assert.equal(isValidIsbn13('5000112637922'), false, 'a grocery EAN with a valid checksum')
    assert.equal(toIsbn13(''), null)
    assert.equal(toIsbn13(null), null)
  })
})
