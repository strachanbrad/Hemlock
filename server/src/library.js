/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { conflictError, httpError } from './errors.js'

// The order of a book's editions: physical before ebook, hardcover before paperback, then id.
export const EDITION_ORDER = "e.format = 'ebook', e.format, e.id"

// The cover rule: the first edition in EDITION_ORDER that has a cover, else books.cover.
export const pickedEdition = (column, book = 'b') =>
  `(SELECT e.${column} FROM editions e WHERE e.book_id = ${book}.id ORDER BY e.cover IS NULL, ${EDITION_ORDER} LIMIT 1)`
export const bookCover = (book = 'b') => `coalesce(${pickedEdition('cover', book)}, ${book}.cover)`

const bookSql = ({ synopsis }) => `
  SELECT b.id, b.title, a.id AS author_id, a.name AS author_name,
         b.star_rating, b.spice_rating, b.gore_rating, b.read, b.wishlist, b.created_at,
         ${synopsis ? 'b.synopsis,' : ''}
         '/covers/' || ${bookCover('b')} AS cover_url,
         (SELECT json_group_array(json_object(
                   'id', e.id, 'format', e.format, 'isbn', e.isbn, 'publisher', e.publisher,
                   'published', e.published, 'cover_url', '/covers/' || e.cover)
                 ORDER BY ${EDITION_ORDER})
            FROM editions e WHERE e.book_id = b.id) AS editions
  FROM books b
  JOIN authors a ON a.id = b.author_id
  WHERE (:id IS NULL OR b.id = :id)
    AND (:author_id IS NULL OR b.author_id = :author_id)
    AND (:like IS NULL OR b.title LIKE :like ESCAPE '\\' OR a.name LIKE :like ESCAPE '\\'
         OR EXISTS (SELECT 1 FROM editions e WHERE e.book_id = b.id AND e.isbn = :isbn))
    AND (:format IS NULL OR EXISTS (SELECT 1 FROM editions e WHERE e.book_id = b.id
           AND (e.format = :format OR (:format = 'physical' AND e.format <> 'ebook'))))
    AND (:owned IS NULL OR EXISTS (SELECT 1 FROM editions e WHERE e.book_id = b.id) = :owned)
    AND (:wishlist IS NULL OR b.wishlist = :wishlist)
    AND (:read IS NULL OR b.read = :read)
  ORDER BY b.title, b.id`

const NO_FILTERS = { id: null, author_id: null, like: null, isbn: null, format: null, owned: null, wishlist: null, read: null }

function toBook(row) {
  const book = {
    id: row.id,
    title: row.title,
    author: { id: row.author_id, name: row.author_name },
    star_rating: row.star_rating,
    spice_rating: row.spice_rating,
    gore_rating: row.gore_rating,
    read: row.read === 1,
    wishlist: row.wishlist === 1,
    created_at: row.created_at,
    cover_url: row.cover_url,
    editions: JSON.parse(row.editions),
  }
  if (row.synopsis !== undefined) book.synopsis = row.synopsis
  return book
}

const BOOK_COLUMNS = ['title', 'author_id', 'synopsis', 'star_rating', 'spice_rating', 'gore_rating', 'read', 'wishlist', 'cover']
const EDITION_COLUMNS = ['format', 'isbn', 'publisher', 'published', 'cover']

// Column names come from the lists above, never from a request.
function assignments(values, columns) {
  const used = columns.filter((column) => Object.hasOwn(values, column))
  return { sql: used.map((column) => `${column} = @${column}`).join(', '), used }
}

export function createLibrary(db) {
  const list = db.prepare(bookSql({ synopsis: false }))
  const one = db.prepare(bookSql({ synopsis: true }))
  const statements = {
    authorById: db.prepare('SELECT id, name FROM authors WHERE id = ?'),
    authorByName: db.prepare('SELECT id, name FROM authors WHERE name = ?'),
    insertAuthor: db.prepare('INSERT INTO authors (name) VALUES (?)'),
    bookByTitle: db.prepare('SELECT id FROM books WHERE author_id = ? AND title = ? AND id <> ?'),
    bookById: db.prepare('SELECT id, title, author_id, cover FROM books WHERE id = ?'),
    editionById: db.prepare('SELECT id, book_id, format, isbn, cover FROM editions WHERE id = ?'),
    editionByIsbn: db.prepare('SELECT id, book_id FROM editions WHERE isbn = ? AND id <> ?'),
    editionWithoutIsbn: db.prepare('SELECT id, book_id FROM editions WHERE book_id = ? AND format = ? AND isbn IS NULL AND id <> ?'),
    insertEdition: db.prepare(`INSERT INTO editions (book_id, format, isbn, publisher, published)
                               VALUES (@book_id, @format, @isbn, @publisher, @published)`),
  }

  const library = {
    listBooks: (filters) => list.all({ ...NO_FILTERS, ...filters }).map(toBook),

    getBook(id) {
      const row = one.get({ ...NO_FILTERS, id })
      if (!row) throw httpError(404, 'Book not found')
      return toBook(row)
    },

    bookRow(id) {
      const row = statements.bookById.get(id)
      if (!row) throw httpError(404, 'Book not found')
      return row
    },

    editionRow(id) {
      const row = statements.editionById.get(id)
      if (!row) throw httpError(404, 'Edition not found')
      return row
    },

    // author_name is find-or-create, matched case-insensitively by the NOCASE column.
    resolveAuthor({ author_id, author_name }) {
      if (author_id !== undefined) {
        const author = statements.authorById.get(author_id)
        if (!author) throw httpError(400, `No author has the id ${author_id}`)
        return author
      }
      const found = statements.authorByName.get(author_name)
      if (found) return found
      return { id: Number(statements.insertAuthor.run(author_name).lastInsertRowid), name: author_name }
    },

    checkTitle(author, title, exceptId = 0) {
      const existing = statements.bookByTitle.get(author.id, title, exceptId)
      if (existing) throw conflictError(`"${title}" by ${author.name} is already in the library`, { book_id: existing.id })
    },

    checkEdition({ book_id, format, isbn }, exceptId = 0) {
      if (isbn) {
        const existing = statements.editionByIsbn.get(isbn, exceptId)
        if (existing) {
          throw conflictError(`ISBN ${isbn} is already in the library`, { book_id: existing.book_id, edition_id: existing.id })
        }
        return
      }
      const existing = statements.editionWithoutIsbn.get(book_id, format, exceptId)
      if (existing) {
        throw conflictError(`This book already has ${format === 'ebook' ? 'an' : 'a'} ${format} edition without an ISBN`, { book_id, edition_id: existing.id })
      }
    },

    insertBook(values) {
      const columns = BOOK_COLUMNS.filter((column) => Object.hasOwn(values, column))
      const sql = `INSERT INTO books (${columns.join(', ')}) VALUES (${columns.map((column) => `@${column}`).join(', ')})`
      return Number(db.prepare(sql).run(values).lastInsertRowid)
    },

    updateBook(id, values) {
      const { sql, used } = assignments(values, BOOK_COLUMNS)
      if (used.length > 0) db.prepare(`UPDATE books SET ${sql} WHERE id = @id`).run({ ...pick(values, used), id })
    },

    insertEdition(bookId, edition) {
      const values = { book_id: bookId, isbn: null, publisher: null, published: null, ...pick(edition, ['format', 'isbn', 'publisher', 'published']) }
      library.checkEdition(values)
      return Number(statements.insertEdition.run(values).lastInsertRowid)
    },

    updateEdition(id, values) {
      const { sql, used } = assignments(values, EDITION_COLUMNS)
      if (used.length > 0) db.prepare(`UPDATE editions SET ${sql} WHERE id = @id`).run({ ...pick(values, used), id })
    },

    coversOfBook(id) {
      return db.prepare(`SELECT cover FROM books WHERE id = ? AND cover IS NOT NULL
                         UNION ALL SELECT cover FROM editions WHERE book_id = ? AND cover IS NOT NULL`).pluck().all(id, id)
    },
  }
  return library
}

export const pick = (values, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(values, key)).map((key) => [key, values[key]]))
