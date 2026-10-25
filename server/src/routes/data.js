/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Router } from 'express'
import { httpError } from '../errors.js'
import { pickFields } from './fields.js'

const INSERTABLE = new Map([
  ['Authors', { table: 'Authors', columns: ['author_id', 'first_name', 'last_name'] }],
])

const DELETABLE = new Map([
  ['Books', { table: 'Books', key: 'isbn' }],
  ['EBooks', { table: 'EBooks', key: 'isbn' }],
])

export default function dataRoutes(db) {
  const router = Router()

  router.post('/data/:table', (req, res) => {
    const target = INSERTABLE.get(req.params.table)
    if (!target) throw httpError(400, 'Invalid table name')

    const body = req.body
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
      throw httpError(400, 'Invalid table name or data')
    }
    const unknown = Object.keys(body).filter((key) => !target.columns.includes(key))
    if (unknown.length > 0) throw httpError(400, `Unknown column: ${unknown.join(', ')}`)

    const fields = pickFields(body, target.columns)
    const columns = fields.map(([column]) => `"${column}"`).join(', ')
    const placeholders = fields.map(() => '?').join(', ')
    const info = db.prepare(`INSERT INTO "${target.table}" (${columns}) VALUES (${placeholders})`)
      .run(...fields.map(([, value]) => value))
    res.json({ message: 'Record added successfully', lastID: Number(info.lastInsertRowid) })
  })

  router.delete('/data/:table/:id', (req, res) => {
    const target = DELETABLE.get(req.params.table)
    if (!target) throw httpError(400, 'Invalid table name')

    const info = db.prepare(`DELETE FROM "${target.table}" WHERE ${target.key} = ?`).run(req.params.id)
    if (info.changes === 0) throw httpError(404, 'No record found with the provided id')
    res.json({ message: 'Record deleted successfully' })
  })

  return router
}
