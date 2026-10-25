/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Router } from 'express'
import multer from 'multer'
import { MAX_COVER_BYTES, saveCoverFromUpload } from '../covers.js'
import { httpError } from '../errors.js'
import { pickFields } from './fields.js'

const BOOK_COLUMNS = ['isbn', 'star_rating', 'spice_rating', 'gore_rating', 'title', 'author_id', 'synopsis', 'read', 'media']

const TABLES = new Map([
  ['Books', { table: 'Books', columns: BOOK_COLUMNS }],
  ['EBooks', { table: 'EBooks', columns: [...BOOK_COLUMNS, 'buy'] }],
])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COVER_BYTES, files: 1 },
}).single('cover')

function bookTable(bookType) {
  const target = TABLES.get(bookType)
  if (!target) throw httpError(400, 'Invalid book type')
  return target
}

export default function bookRoutes(db) {
  const router = Router()

  router.get('/:bookType/get', (req, res) => {
    const { table } = bookTable(req.params.bookType)
    res.json({ message: `${table} retrieved successfully`, data: db.prepare(`SELECT * FROM ${table}`).all() })
  })

  router.get('/:bookType/author/:authorId', (req, res) => {
    const { table } = bookTable(req.params.bookType)
    const books = db.prepare(`SELECT * FROM ${table} WHERE author_id = ?`).all(req.params.authorId)
    res.json({ message: `${table} books retrieved successfully`, data: books })
  })

  router.post('/:bookType/:isbn/update', upload, (req, res) => {
    const { table, columns } = bookTable(req.params.bookType)
    const { isbn } = req.params
    const fields = pickFields(req.body, columns.filter((column) => column !== 'isbn'))

    const book = db.transaction(() => {
      if (fields.length > 0) {
        db.prepare(`UPDATE ${table} SET ${fields.map(([column]) => `${column} = ?`).join(', ')} WHERE isbn = ?`)
          .run(...fields.map(([, value]) => value), isbn)
      }
      const row = db.prepare(`SELECT * FROM ${table} WHERE isbn = ?`).get(isbn)
      if (!row) throw httpError(404, `Book with ISBN ${isbn} not found in ${table}`)
      if (req.file) saveCoverFromUpload(req.file, isbn)
      return row
    })()

    res.json({ message: 'Book updated successfully', data: book })
  })

  router.post('/:bookType/:isbn/insert', upload, (req, res) => {
    const { table, columns } = bookTable(req.params.bookType)
    const fields = pickFields(req.body, columns)
    if (fields.length === 0) throw httpError(400, 'No book fields given')

    db.transaction(() => {
      db.prepare(`INSERT INTO ${table} (${fields.map(([column]) => column).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`)
        .run(...fields.map(([, value]) => value))
      if (req.file) saveCoverFromUpload(req.file, req.params.isbn)
    })()

    res.json({ message: 'Book inserted successfully' })
  })

  router.post('/convertEBookToBook', (req, res) => {
    const { isbn, media } = req.body ?? {}
    if (!isbn) throw httpError(400, 'ISBN must be provided')
    if (typeof media !== 'string' || !media) throw httpError(400, 'Media must be provided')

    db.transaction(() => {
      const ebook = db.prepare('SELECT * FROM EBooks WHERE isbn = ?').get(isbn)
      if (!ebook) throw httpError(404, 'EBook not found')
      const book = { ...ebook, media }
      db.prepare(`INSERT INTO Books (${BOOK_COLUMNS.join(', ')}) VALUES (${BOOK_COLUMNS.map(() => '?').join(', ')})`)
        .run(...BOOK_COLUMNS.map((column) => book[column]))
      db.prepare('DELETE FROM EBooks WHERE isbn = ?').run(isbn)
    })()

    res.json({ message: 'EBook converted to Book successfully' })
  })

  return router
}
