/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Router } from 'express'
import { httpError } from '../errors.js'
import { bookCover, pickedEdition } from '../library.js'

const FILTERS = new Set(['all', 'read', 'unread', 'owned'])

export function listDisplayBooks(db, filter) {
  const rows = db.prepare(`
    SELECT b.id, b.title, a.name AS author, b.synopsis,
           ${bookCover('b')} AS cover, ${pickedEdition('format', 'b')} AS format,
           b.read, b.star_rating, b.spice_rating, b.gore_rating
    FROM books b
    JOIN authors a ON a.id = b.author_id
    WHERE :filter = 'all'
       OR (:filter = 'read' AND b.read = 1)
       OR (:filter = 'unread' AND b.read = 0)
       OR (:filter = 'owned' AND EXISTS (SELECT 1 FROM editions e WHERE e.book_id = b.id))
    ORDER BY b.title COLLATE NOCASE, b.id
  `).all({ filter })

  return rows.map(({ cover, read, ...book }) => ({
    ...book,
    read: read === 1,
    cover_url: cover ? `/covers/${cover}` : null,
  }))
}

export default function displayRoutes(db) {
  const router = Router()

  router.get('/display', (req, res) => {
    const filter = req.query.filter ?? 'owned'
    if (!FILTERS.has(filter)) throw httpError(400, 'filter must be all, read, unread or owned')
    res.json(listDisplayBooks(db, filter))
  })

  return router
}
