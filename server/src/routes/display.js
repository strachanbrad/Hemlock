/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import fs from 'node:fs'
import { Router } from 'express'
import { coversDir } from '../covers.js'
import { httpError } from '../errors.js'

const FILTERS = new Set(['all', 'read', 'unread', 'owned'])

function coverFiles() {
  try {
    return new Set(fs.readdirSync(coversDir))
  } catch (err) {
    if (err.code === 'ENOENT') return new Set()
    throw err
  }
}

// Under the Authors/Books/EBooks schema every row is an owned copy, so owned equals all.
export function listDisplayBooks(db, filter) {
  const rows = db.prepare(`
    SELECT id, title, author, synopsis, isbn, format, read, star_rating, spice_rating, gore_rating
    FROM (
      SELECT 'b' || b.isbn AS id, b.title,
             nullif(trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '') AS author,
             coalesce(b.synopsis, '') AS synopsis,
             b.isbn,
             CASE lower(b.media) WHEN 'hardcover' THEN 'hardcover' WHEN 'paperback' THEN 'paperback' END AS format,
             CASE WHEN b.read IN (1, '1', 'true') THEN 1 ELSE 0 END AS read,
             CAST(coalesce(b.star_rating, 0) AS INTEGER) AS star_rating,
             CAST(coalesce(b.spice_rating, 0) AS INTEGER) AS spice_rating,
             CAST(coalesce(b.gore_rating, 0) AS INTEGER) AS gore_rating
      FROM Books b LEFT JOIN Authors a ON a.author_id = b.author_id
      UNION ALL
      SELECT 'e' || e.isbn, e.title,
             nullif(trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), ''),
             coalesce(e.synopsis, ''),
             e.isbn,
             'ebook',
             CASE WHEN e.read IN (1, '1', 'true') THEN 1 ELSE 0 END,
             CAST(coalesce(e.star_rating, 0) AS INTEGER),
             CAST(coalesce(e.spice_rating, 0) AS INTEGER),
             CAST(coalesce(e.gore_rating, 0) AS INTEGER)
      FROM EBooks e LEFT JOIN Authors a ON a.author_id = e.author_id
    )
    WHERE :filter IN ('all', 'owned')
       OR (:filter = 'read' AND read = 1)
       OR (:filter = 'unread' AND read = 0)
    ORDER BY title COLLATE NOCASE, id
  `).all({ filter })

  const files = coverFiles()
  return rows.map(({ isbn, read, ...book }) => ({
    ...book,
    read: read === 1,
    cover_url: files.has(`${isbn}.jpg`) ? `/covers/${isbn}.jpg` : null,
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
