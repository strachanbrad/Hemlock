/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { authorPayload, collapse } from '../../lib/authors.js'
import { toIsbn13 } from '../../lib/isbn.js'

export const OWNED = 'owned'
export const WISHLIST = 'wishlist'

// The POST /api/books body for the add form. A wishlist book has no edition and keeps the lookup's
// cover on the book; an owned one carries its edition, and is wishlisted only as an ebook wanting print.
export function bookPayload(values, coverUrl) {
  const owned = values.ownership === OWNED
  const edition = owned
    ? {
        format: values.format,
        isbn: values.isbn?.trim() ? toIsbn13(values.isbn) : null,
        publisher: values.publisher?.trim() || null,
        published: values.published?.trim() || null,
        ...(coverUrl && { cover_from_url: coverUrl }),
      }
    : null
  return {
    title: collapse(values.title),
    ...authorPayload(values.author),
    synopsis: values.synopsis.trim(),
    star_rating: values.star_rating,
    spice_rating: values.spice_rating,
    gore_rating: values.gore_rating,
    read: values.read,
    wishlist: !owned || (values.format === 'ebook' && values.wishlist),
    ...(edition && { edition }),
    ...(!owned && coverUrl && { cover_from_url: coverUrl }),
  }
}
