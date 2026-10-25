/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useState } from 'react'
import { App, Button, Skeleton } from 'antd'
import { Link } from 'react-router'
import { deleteBook, updateBook } from '../../api/books.js'
import { addEdition, updateEdition } from '../../api/editions.js'
import BookCover from '../../components/BookCover.jsx'
import { BookRating, RATINGS, ReadToggle } from '../../components/BookRatings.jsx'
import { ChangeCoverButton } from '../../components/CoverPicker.jsx'
import FormatTags from '../../components/FormatTags.jsx'
import { resizeCover } from '../../lib/resizeImage.js'
import BookEditForm from './BookEditForm.jsx'
import EditionForm from './EditionForm.jsx'
import EditionList from './EditionList.jsx'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// The detail of one book: view, the edit form, or the edition form (add, purchase or edit).
const BookDetail = ({ book, loaded, initialMode, onSave, onReplace, onDeleted }) => {
  const { message, modal } = App.useApp()
  const [mode, setMode] = useState(initialMode === 'purchase' && book.wishlist ? { form: 'purchase' } : { form: null })
  const [coverBusy, setCoverBusy] = useState(false)
  const view = () => setMode({ form: null })

  const saved = (next) => {
    onReplace(next)
    view()
  }

  const confirmDelete = () => {
    const covers = book.editions.filter((edition) => edition.cover_url).length || (book.cover_url ? 1 : 0)
    modal.confirm({
      title: `Delete “${book.title}”?`,
      content: `${plural(book.editions.length, 'edition')} and ${plural(covers, 'cover')} are deleted with it.`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteBook(book.id)
          message.success(`Deleted “${book.title}”`)
          onDeleted(book.id)
        } catch (err) {
          message.error(err.message)
        }
      },
    })
  }

  const changeBookCover = async (file) => {
    setCoverBusy(true)
    try {
      onReplace(await updateBook(book.id, {}, await resizeCover(file)))
    } catch (err) {
      message.error(err.message)
    } finally {
      setCoverBusy(false)
    }
  }

  if (mode.form === 'book') {
    return <BookEditForm book={book} onSaved={saved} onCancel={view} />
  }
  if (mode.form) {
    const submit = async (payload, file) => {
      const next = mode.form === 'edit' ? await updateEdition(mode.edition.id, payload, file) : await addEdition(book.id, payload, file)
      saved(next)
      return next
    }
    return <EditionForm mode={mode.form} edition={mode.edition} onSubmit={submit} onCancel={view} />
  }

  return (
    <div className="book-detail">
      <div className="book-detail-head">
        <BookCover url={book.cover_url} title={book.title} size="large" />
        <div className="book-detail-heading">
          <Link to={{ pathname: '/library', search: `?author_id=${book.author.id}` }} className="book-detail-author">{book.author.name}</Link>
          <FormatTags book={book} />
          <div className="book-detail-buttons">
            <Button onClick={() => setMode({ form: 'book' })} disabled={!loaded}>Edit</Button>
            {book.editions.length === 0 && <ChangeCoverButton size="middle" busy={coverBusy} onFile={changeBookCover} />}
          </div>
        </div>
      </div>

      <dl className="book-detail-ratings">
        <div className="detail-rating-row">
          <dt>Read</dt>
          <dd><ReadToggle book={book} onSave={onSave} size="large" /></dd>
        </div>
        {RATINGS.map(({ field, label }) => (
          <div key={field} className="detail-rating-row">
            <dt>{label}</dt>
            <dd><BookRating book={book} field={field} onSave={onSave} size="large" /></dd>
          </div>
        ))}
      </dl>

      <section className="book-detail-section">
        <h4 className="section-title">Synopsis</h4>
        {!loaded ? <Skeleton active title={false} paragraph={{ rows: 3 }} /> : book.synopsis ? <p className="book-detail-synopsis">{book.synopsis}</p> : <p className="secondary">No synopsis.</p>}
      </section>

      <section className="book-detail-section">
        <h4 className="section-title">Editions</h4>
        <EditionList book={book} onReplace={onReplace} onEdit={(edition) => setMode({ form: 'edit', edition })} />
        <div className="book-detail-buttons">
          <Button onClick={() => setMode({ form: 'add' })}>Add edition</Button>
          {book.wishlist && <Button type="primary" onClick={() => setMode({ form: 'purchase' })}>Mark as purchased</Button>}
        </div>
      </section>

      <div className="book-detail-danger">
        <Button danger onClick={confirmDelete}>Delete book</Button>
      </div>
    </div>
  )
}

export default BookDetail
