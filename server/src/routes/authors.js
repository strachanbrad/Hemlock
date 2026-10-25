/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Router } from 'express'
import { conflictError, httpError } from '../errors.js'
import { authorPayload, pathId } from '../validate.js'

const AUTHORS = `SELECT a.id, a.name, count(b.id) AS book_count
                 FROM authors a LEFT JOIN books b ON b.author_id = a.id
                 WHERE (:id IS NULL OR a.id = :id)
                 GROUP BY a.id ORDER BY a.name, a.id`

export default function authorRoutes(db) {
  const router = Router()
  const authors = db.prepare(AUTHORS)
  const byName = db.prepare('SELECT id FROM authors WHERE name = ? AND id <> ?')

  const author = (id) => {
    const row = authors.get({ id })
    if (!row) throw httpError(404, 'Author not found')
    return row
  }

  router.get('/authors', (req, res) => {
    res.json(authors.all({ id: null }))
  })

  router.patch('/authors/:id', (req, res) => {
    const id = pathId(req.params.id, 'Author')
    const { name } = authorPayload(req.body)
    db.transaction(() => {
      author(id)
      const existing = byName.get(name, id)
      if (existing) throw conflictError(`An author named ${name} exists`, { author_id: existing.id })
      db.prepare('UPDATE authors SET name = ? WHERE id = ?').run(name, id)
    })()
    res.json(author(id))
  })

  router.delete('/authors/:id', (req, res) => {
    const id = pathId(req.params.id, 'Author')
    db.transaction(() => {
      const { book_count: count } = author(id)
      if (count > 0) throw conflictError(`The author has ${count} ${count === 1 ? 'book' : 'books'}; delete or move them first`, { book_count: count })
      db.prepare('DELETE FROM authors WHERE id = ?').run(id)
    })()
    res.status(204).end()
  })

  return router
}
