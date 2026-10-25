/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Router } from 'express'
import { readBody } from '../body.js'
import { attachDownloadedCovers, coverDownload, prepareUpload, withCoverFiles } from '../coverFiles.js'
import { createLibrary, pick } from '../library.js'
import { PHYSICAL, bookPayload, listFilters, pathId } from '../validate.js'

const BOOK_VALUES = ['title', 'synopsis', 'star_rating', 'spice_rating', 'gore_rating', 'read', 'wishlist']

export default function bookRoutes(db, saveCover) {
  const router = Router()
  const library = createLibrary(db)

  router.get('/books', (req, res) => {
    res.json(library.listBooks(listFilters(req.query)))
  })

  router.get('/books/:id', (req, res) => {
    res.json(library.getBook(pathId(req.params.id, 'Book')))
  })

  router.post('/books', readBody, async (req, res) => {
    const input = bookPayload(req.payload, { create: true })
    const cover = await prepareUpload(req.cover, input.cover_from_url, input.edition?.cover_from_url)

    const downloads = []
    const id = withCoverFiles(db, (files) => {
      const author = library.resolveAuthor(input)
      library.checkTitle(author, input.title)
      const values = { ...pick(input, BOOK_VALUES), author_id: author.id }
      if (input.edition && PHYSICAL.has(input.edition.format)) values.wishlist = 0
      const bookId = library.insertBook(values)
      if (input.cover_from_url) downloads.push(coverDownload(db, 'books', bookId, input.cover_from_url))
      if (input.edition) {
        const editionId = library.insertEdition(bookId, input.edition)
        if (cover) library.updateEdition(editionId, { cover: files.write(cover, `e${editionId}`) })
        if (input.edition.cover_from_url) downloads.push(coverDownload(db, 'editions', editionId, input.edition.cover_from_url))
      } else if (cover) {
        library.updateBook(bookId, { cover: files.write(cover, `b${bookId}`) })
      }
      return bookId
    })
    await attachDownloadedCovers(db, downloads, saveCover)
    res.status(201).json(library.getBook(id))
  })

  router.patch('/books/:id', readBody, async (req, res) => {
    const id = pathId(req.params.id, 'Book')
    const input = bookPayload(req.payload, { create: false })
    const cover = await prepareUpload(req.cover, input.cover_from_url, input.remove_cover)

    withCoverFiles(db, (files) => {
      const book = library.bookRow(id)
      const values = pick(input, BOOK_VALUES)
      const authorChanges = input.author_id !== undefined || input.author_name !== undefined
      if (authorChanges || values.title !== undefined) {
        const author = library.resolveAuthor(authorChanges ? input : { author_id: book.author_id })
        library.checkTitle(author, values.title ?? book.title, id)
        values.author_id = author.id
      }
      if (cover || input.remove_cover) {
        files.discard(book.cover)
        values.cover = cover ? files.write(cover, `b${id}`) : null
      }
      library.updateBook(id, values)
    })
    if (input.cover_from_url) await attachDownloadedCovers(db, [coverDownload(db, 'books', id, input.cover_from_url)], saveCover)
    res.json(library.getBook(id))
  })

  router.delete('/books/:id', (req, res) => {
    const id = pathId(req.params.id, 'Book')
    withCoverFiles(db, (files) => {
      library.bookRow(id)
      for (const cover of library.coversOfBook(id)) files.discard(cover)
      db.prepare('DELETE FROM books WHERE id = ?').run(id)
    })
    res.status(204).end()
  })

  return router
}
