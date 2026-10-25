/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it } from 'vitest'
import { OWNED, WISHLIST, bookPayload } from '../src/pages/AddBook/payload.js'

const values = (changes) => ({
  isbn: '0-553-21258-3', title: '  Wuthering   Heights ', author: { id: 3, name: 'Emily Brontë' }, ownership: OWNED,
  format: 'paperback', wishlist: false, read: true, star_rating: 4, spice_rating: 1, gore_rating: 0,
  synopsis: ' A brooding tale. ', publisher: ' Bantam Books ', published: '1981-03', cover: null,
  ...changes,
})
const COVER = 'https://covers.openlibrary.org/b/id/1-L.jpg'

describe('the add form payload', () => {
  it('sends an owned book with its edition and the lookup cover on the edition', () => {
    expect(bookPayload(values(), COVER)).toEqual({
      title: 'Wuthering Heights', author_id: 3, synopsis: 'A brooding tale.',
      star_rating: 4, spice_rating: 1, gore_rating: 0, read: true, wishlist: false,
      edition: { format: 'paperback', isbn: '9780553212587', publisher: 'Bantam Books', published: '1981-03', cover_from_url: COVER },
    })
  })

  it('puts an owned ebook on the wishlist only when a physical copy is wanted', () => {
    expect(bookPayload(values({ format: 'ebook', isbn: '', wishlist: true }), null)).toMatchObject({ wishlist: true, edition: { format: 'ebook', isbn: null } })
    expect(bookPayload(values({ format: 'ebook', isbn: '', wishlist: false }), null).wishlist).toBe(false)
    expect(bookPayload(values({ format: 'paperback', wishlist: true }), null).wishlist).toBe(false)
  })

  it('sends a wishlist book with no edition and the lookup cover on the book', () => {
    const payload = bookPayload(values({ ownership: WISHLIST, author: { name: 'Mary Shelley' } }), COVER)
    expect(payload).toEqual({
      title: 'Wuthering Heights', author_name: 'Mary Shelley', synopsis: 'A brooding tale.',
      star_rating: 4, spice_rating: 1, gore_rating: 0, read: true, wishlist: true, cover_from_url: COVER,
    })
  })
})
