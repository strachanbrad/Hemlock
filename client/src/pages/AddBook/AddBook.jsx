/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useState } from 'react'
import { Alert, App, Button, Form, Input, Radio, Switch } from 'antd'
import { Link, useNavigate } from 'react-router'
import { listAuthors } from '../../api/authors.js'
import { createBook } from '../../api/books.js'
import { addEdition } from '../../api/editions.js'
import AuthorSelect from '../../components/AuthorSelect.jsx'
import { RATINGS } from '../../components/BookRatings.jsx'
import { CoverPicker } from '../../components/CoverPicker.jsx'
import IsbnField from '../../components/IsbnField.jsx'
import LookupCover from '../../components/LookupCover.jsx'
import Rating from '../../components/Rating.jsx'
import ToggleIcon from '../../components/ToggleIcon.jsx'
import { BookClosed, BookOpen } from '../../images/index.js'
import { authorPayload, collapse } from '../../lib/authors.js'
import { toIsbn13 } from '../../lib/isbn.js'
import { bookFromLookup, creditLine } from '../../lib/prefill.js'
import { resizeCover } from '../../lib/resizeImage.js'
import { useIsPhone } from '../../lib/viewport.js'
import { isbnRule, publishedRule } from '../Library/EditionForm.jsx'
import '../../styles/forms.css'

const NOT_OWNED = 'none'
const FORMATS = [
  { value: 'hardcover', label: 'Hardcover' },
  { value: 'paperback', label: 'Paperback' },
  { value: 'ebook', label: 'Ebook' },
  { value: NOT_OWNED, label: 'Not owned yet' },
]
const INITIAL = {
  isbn: '', title: '', author: undefined, format: undefined, wishlist: false, read: false,
  star_rating: 0, spice_rating: 0, gore_rating: 0, synopsis: '', publisher: '', published: '', cover: null,
}

const AddBook = () => {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const format = Form.useWatch('format', form)
  const cover = Form.useWatch('cover', form)
  const navigate = useNavigate()
  const isPhone = useIsPhone()
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(null)
  const [found, setFound] = useState(null)
  const [lookupCover, setLookupCover] = useState(null)
  const [more, setMore] = useState(false)
  const notOwned = format === NOT_OWNED

  const prefill = async (record, { scanned }) => {
    let authors = []
    try {
      authors = await listAuthors()
    } catch {
      // Without the list the lookup's author is offered as a new name; the save still matches it.
    }
    const values = bookFromLookup(record, authors, {
      scanned,
      allowed: ['hardcover', 'paperback', 'ebook'],
      currentFormat: form.getFieldValue('format'),
    })
    form.setFieldsValue(values)
    if (values.publisher || values.published) setMore(true)
    setFound(record)
    setLookupCover(record.cover_url)
    setConflict(null)
  }

  const submit = async (values) => {
    const owned = values.format !== NOT_OWNED
    const coverUrl = !values.cover && lookupCover ? lookupCover : null
    const edition = owned
      ? {
          format: values.format,
          isbn: values.isbn?.trim() ? toIsbn13(values.isbn) : null,
          publisher: values.publisher?.trim() || null,
          published: values.published?.trim() || null,
          ...(coverUrl && { cover_from_url: coverUrl }),
        }
      : null
    const payload = {
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

    setSaving(true)
    setConflict(null)
    try {
      const file = values.cover ? await resizeCover(values.cover) : null
      try {
        const book = await createBook(payload, file)
        if (coverUrl && !book.cover_url) message.warning(`Added “${book.title}” without the cover: it could not be downloaded`)
        else message.success(`Added “${book.title}”`)
        navigate(`/library/${book.id}`)
      } catch (err) {
        if (err.status !== 409 || !err.body?.conflict?.book_id) throw err
        const { book_id: bookId, edition_id: editionId } = err.body.conflict
        setConflict({ message: err.message, bookId, edition: editionId ? null : edition, file })
      }
    } catch (err) {
      message.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const addAsEdition = async () => {
    setSaving(true)
    try {
      await addEdition(conflict.bookId, conflict.edition, conflict.file)
      message.success('Added as an edition of the existing book')
      navigate(`/library/${conflict.bookId}`)
    } catch (err) {
      message.error(err.message)
      setSaving(false)
    }
  }

  const reset = () => {
    form.resetFields()
    setConflict(null)
    setFound(null)
    setLookupCover(null)
    setMore(false)
  }

  return (
    <section className="add-book">
      <h2 className="page-title">Add a book</h2>
      <Form form={form} layout="vertical" initialValues={INITIAL} onFinish={submit} disabled={saving} onValuesChange={() => setConflict(null)}>
        <div className="add-book-grid">
          <div className="add-book-column">
            <Form.Item
              name="isbn"
              label="ISBN"
              rules={[isbnRule]}
              extra={notOwned ? 'Used to look the book up; a book not owned yet has no edition to keep it.' : 'ISBN-10 or ISBN-13; scan the barcode or type it and look it up'}
            >
              <IsbnField onFound={prefill} />
            </Form.Item>
            <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, message: 'Enter a title' }]}>
              <Input maxLength={500} />
            </Form.Item>
            <Form.Item name="author" label="Author" rules={[{ required: true, message: 'Choose an author or type a new name' }]}>
              <AuthorSelect />
            </Form.Item>
            <Form.Item name="format" label="Format" rules={[{ required: true, message: 'Choose a format' }]}>
              {isPhone
                ? <Radio.Group className="format-choice" options={FORMATS} orientation="vertical" />
                : <Radio.Group className="format-choice" options={FORMATS} optionType="button" buttonStyle="solid" />}
            </Form.Item>
            {format === 'ebook' && (
              <Form.Item name="wishlist" label="Want a physical copy" valuePropName="checked">
                <Switch />
              </Form.Item>
            )}
            {notOwned && (
              <Form.Item label="Want a physical copy" extra="A book not owned yet goes on the buy list.">
                <Switch checked disabled />
              </Form.Item>
            )}
            {!notOwned && (more ? (
              <>
                <Form.Item name="publisher" label="Publisher"><Input maxLength={200} /></Form.Item>
                <Form.Item name="published" label="Published" rules={[publishedRule]}><Input placeholder="YYYY-MM-DD" inputMode="numeric" /></Form.Item>
              </>
            ) : (
              <Button type="link" className="more-toggle" onClick={() => setMore(true)}>More: publisher and date</Button>
            ))}
            <Form.Item name="cover" label="Cover" extra={notOwned ? 'Kept on the book until an edition with a cover is added.' : undefined}>
              <CoverPicker />
            </Form.Item>
            {lookupCover && !cover && <LookupCover url={lookupCover} onRemove={() => setLookupCover(null)} />}
          </div>
          <div className="add-book-column">
            <Form.Item name="read" label="Read">
              <ToggleIcon trueIcon={BookOpen} falseIcon={BookClosed} trueLabel="Read" falseLabel="Not read" size="large" />
            </Form.Item>
            {RATINGS.map(({ field, label, filledIcon, unfilledIcon }) => (
              <Form.Item key={field} name={field} label={label}>
                <Rating label={label} filledIcon={filledIcon} unfilledIcon={unfilledIcon} size="large" />
              </Form.Item>
            ))}
            <Form.Item name="synopsis" label="Synopsis">
              <Input.TextArea autoSize={{ minRows: 4, maxRows: 14 }} />
            </Form.Item>
          </div>
        </div>
        {conflict && (
          <Alert
            className="add-book-conflict"
            type="warning"
            showIcon
            title={conflict.message}
            description={(
              <div className="conflict-actions">
                <Link to={`/library/${conflict.bookId}`}>Open the existing book</Link>
                {conflict.edition && <Button size="small" onClick={addAsEdition}>Add this as an edition</Button>}
              </div>
            )}
          />
        )}
        <div className="form-actions">
          <Button htmlType="button" onClick={reset}>Reset</Button>
          <Button type="primary" htmlType="submit" loading={saving}>Add book</Button>
        </div>
      </Form>
      <p className="credit secondary">{creditLine(found)}</p>
    </section>
  )
}

export default AddBook
