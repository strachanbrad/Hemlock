/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Router } from 'express'
import { readBody } from '../body.js'
import { checkCoverSources, withCoverFiles } from '../coverFiles.js'
import { createLibrary, pick } from '../library.js'
import { PHYSICAL, editionPayload, pathId } from '../validate.js'

const EDITION_VALUES = ['format', 'isbn', 'publisher', 'published']

export default function editionRoutes(db) {
  const router = Router()
  const library = createLibrary(db)

  // A physical edition clears the wishlist flag, which means a physical copy is wanted.
  router.post('/books/:id/editions', readBody, (req, res) => {
    const id = pathId(req.params.id, 'Book')
    const input = editionPayload(req.payload, { create: true })
    checkCoverSources(req.cover, input.cover_from_url)

    withCoverFiles(db, (files) => {
      library.bookRow(id)
      const editionId = library.insertEdition(id, input)
      if (req.cover) library.updateEdition(editionId, { cover: files.write(req.cover, `e${editionId}`) })
      if (PHYSICAL.has(input.format)) library.updateBook(id, { wishlist: 0 })
    })
    res.status(201).json(library.getBook(id))
  })

  router.patch('/editions/:id', readBody, (req, res) => {
    const id = pathId(req.params.id, 'Edition')
    const input = editionPayload(req.payload, { create: false })
    checkCoverSources(req.cover, input.cover_from_url, input.remove_cover)

    const bookId = withCoverFiles(db, (files) => {
      const edition = library.editionRow(id)
      const values = pick(input, EDITION_VALUES)
      if (values.format !== undefined || values.isbn !== undefined) {
        library.checkEdition({ ...edition, ...values }, id)
      }
      if (req.cover || input.remove_cover) {
        files.discard(edition.cover)
        values.cover = req.cover ? files.write(req.cover, `e${id}`) : null
      }
      library.updateEdition(id, values)
      return edition.book_id
    })
    res.json(library.getBook(bookId))
  })

  router.delete('/editions/:id', (req, res) => {
    const id = pathId(req.params.id, 'Edition')
    const bookId = withCoverFiles(db, (files) => {
      const edition = library.editionRow(id)
      files.discard(edition.cover)
      db.prepare('DELETE FROM editions WHERE id = ?').run(id)
      return edition.book_id
    })
    res.json(library.getBook(bookId))
  })

  return router
}
