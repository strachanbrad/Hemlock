/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Form, Input, Radio, Segmented, Switch } from 'antd'
import { Link, useNavigate } from 'react-router'
import { listAuthors } from '../../api/authors.js'
import { createBook } from '../../api/books.js'
import { addEdition } from '../../api/editions.js'
import AuthorSelect from '../../components/AuthorSelect.jsx'
import BookCover from '../../components/BookCover.jsx'
import { RATINGS } from '../../components/BookRatings.jsx'
import { CoverPicker } from '../../components/CoverPicker.jsx'
import { PageHeading, SectionHeading } from '../../components/Headings.jsx'
import IsbnField from '../../components/IsbnField.jsx'
import LookupCredit from '../../components/LookupCredit.jsx'
import Rating from '../../components/Rating.jsx'
import ToggleIcon from '../../components/ToggleIcon.jsx'
import { BookClosed, BookmarkFilled, BookOpen } from '../../images/index.js'
import { bookFromLookup, untouchedFields } from '../../lib/prefill.js'
import { resizeCover } from '../../lib/resizeImage.js'
import { useIsPhone } from '../../lib/viewport.js'
import { isbnRule, publishedRule } from '../Library/EditionForm.jsx'
import { OWNED, WISHLIST, bookPayload } from './payload.js'
import '../../styles/forms.css'

const OWNERSHIP = [
  { value: OWNED, label: 'I own it' },
  { value: WISHLIST, label: 'On my wishlist' },
]
const FORMATS = [
  { value: 'hardcover', label: 'Hardcover' },
  { value: 'paperback', label: 'Paperback' },
  { value: 'ebook', label: 'Ebook' },
]
const INITIAL = {
  isbn: '', title: '', author: undefined, ownership: OWNED, format: undefined, wishlist: false, read: false,
  star_rating: 0, spice_rating: 0, gore_rating: 0, synopsis: '', publisher: '', published: '', cover: null,
}

// Aborting on cleanup keeps a slow read from landing after the file has changed.
const FilePreview = ({ file }) => {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    const reader = new FileReader()
    reader.onload = () => setUrl(reader.result)
    reader.readAsDataURL(file)
    return () => reader.abort()
  }, [file])
  return url ? <img src={url} alt="The chosen cover" /> : null
}

// What the book will be saved with: the chosen file, else the lookup's cover, else a cloth cover.
const CoverPreview = ({ file, lookupUrl, title }) => {
  if (file) return <div className="cover-preview"><FilePreview key={`${file.name}-${file.size}-${file.lastModified}`} file={file} /></div>
  if (lookupUrl) {
    return (
      <div className="cover-preview">
        <img src={lookupUrl} alt="The cover the lookup found" referrerPolicy="no-referrer" />
      </div>
    )
  }
  return <div className="cover-preview" aria-hidden="true"><BookCover title={title?.trim() ?? ''} size="large" /></div>
}

const AddBook = () => {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const ownership = Form.useWatch('ownership', form)
  const format = Form.useWatch('format', form)
  const cover = Form.useWatch('cover', form)
  const title = Form.useWatch('title', form)
  const navigate = useNavigate()
  const isPhone = useIsPhone()
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(null)
  const [found, setFound] = useState(null)
  const [lookupCover, setLookupCover] = useState(null)
  const [more, setMore] = useState(false)
  const filled = useRef({ isbn: null, values: {}, ticket: 0 })
  const conflictRef = useRef(null)
  const wished = ownership === WISHLIST

  useEffect(() => {
    if (conflict) conflictRef.current?.scrollIntoView({ block: 'center' })
  }, [conflict])

  // Each lookup resets what the previous one filled and the person left unchanged, so two books
  // never mix; a failed or empty lookup of the ISBN already filled in changes nothing.
  const prefill = async (record, { scanned, isbn }) => {
    const previous = filled.current
    if (!record && isbn === previous.isbn) return
    const ticket = previous.ticket + 1
    const leftovers = untouchedFields(previous.values, form.getFieldsValue(Object.keys(previous.values)))
    if (leftovers.length > 0) form.resetFields(leftovers)
    filled.current = { isbn: null, values: {}, ticket }
    setFound(record)
    setLookupCover(record?.cover_url ?? null)
    setConflict(null)
    if (!record) return

    let authors = []
    try {
      authors = await listAuthors()
    } catch {
      // Without the list the lookup's author is offered as a new name; the save still matches it.
    }
    if (filled.current.ticket !== ticket) return
    const values = bookFromLookup(record, authors, {
      scanned,
      allowed: ['hardcover', 'paperback', 'ebook'],
      currentFormat: form.getFieldValue('format'),
    })
    form.setFieldsValue(values)
    filled.current = { isbn: record.isbn, values, ticket }
    if (values.publisher || values.published) setMore(true)
  }

  const submit = async (values) => {
    const coverUrl = !values.cover && lookupCover ? lookupCover : null
    const payload = bookPayload(values, coverUrl)
    const { edition = null } = payload

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
        message.warning(err.message)
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
    filled.current = { isbn: null, values: {}, ticket: filled.current.ticket + 1 }
    setConflict(null)
    setFound(null)
    setLookupCover(null)
    setMore(false)
  }

  return (
    <section className="add-book">
      <PageHeading>Add a book</PageHeading>
      <Form form={form} layout="vertical" initialValues={INITIAL} onFinish={submit} disabled={saving} onValuesChange={() => setConflict(null)}>
        <section className="add-section add-find" aria-labelledby="add-find-title">
          <SectionHeading id="add-find-title">Find it</SectionHeading>
          <p className="add-helper reading">Scan the barcode on the back cover, or type the ISBN and look it up; the details fill themselves in.</p>
          <Form.Item
            name="isbn"
            label="ISBN"
            rules={[isbnRule]}
            extra={wished ? 'Only used for the lookup: a book on the wishlist keeps no ISBN.' : undefined}
          >
            <IsbnField onLookup={prefill} size="large" prominent placeholder="ISBN-10 or ISBN-13" />
          </Form.Item>
        </section>

        <section className="add-section" aria-labelledby="add-book-title">
          <SectionHeading id="add-book-title">The book</SectionHeading>
          <div className="add-book-layout">
            <div className="add-cover">
              <CoverPreview file={cover} lookupUrl={lookupCover} title={title} />
              {lookupCover && !cover && (
                <div className="lookup-cover-text">
                  <span className="secondary reading">Found by the lookup; saved with the book unless you choose a file.</span>
                  <Button size="small" type="text" onClick={() => setLookupCover(null)}>Don’t use this cover</Button>
                </div>
              )}
              <Form.Item name="cover" className="add-cover-picker" extra={wished ? 'Kept on the book until a copy with a cover is added.' : undefined}>
                <CoverPicker listType="text" label={cover ? 'Choose another' : 'Choose a cover'} />
              </Form.Item>
            </div>
            <div className="add-fields">
              <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, message: 'Enter a title' }]}>
                <Input maxLength={500} className="add-title-input" />
              </Form.Item>
              <Form.Item name="author" label="Author" rules={[{ required: true, message: 'Choose an author or type a new name' }]}>
                <AuthorSelect />
              </Form.Item>
              <Form.Item name="ownership" label="Ownership">
                <Segmented block options={OWNERSHIP} className="ownership-choice" />
              </Form.Item>
              {wished ? (
                <p className="wishlist-note reading">
                  <BookmarkFilled aria-hidden="true" className="wishlist-note-icon" />
                  It goes on the wishlist until you add a copy.
                </p>
              ) : (
                <>
                  <Form.Item name="format" label="Format" rules={[{ required: true, message: 'Choose a format' }]}>
                    <Radio.Group className="format-choice" block={isPhone} options={FORMATS} optionType="button" buttonStyle="solid" />
                  </Form.Item>
                  {format === 'ebook' && (
                    <Form.Item name="wishlist" label="Want a physical copy" valuePropName="checked" extra="A physical copy wanted puts the book on the wishlist too.">
                      <Switch />
                    </Form.Item>
                  )}
                  {more ? (
                    <div className="add-more">
                      <Form.Item name="publisher" label="Publisher"><Input maxLength={200} /></Form.Item>
                      <Form.Item name="published" label="Published" rules={[publishedRule]}><Input placeholder="YYYY-MM-DD" inputMode="numeric" /></Form.Item>
                    </div>
                  ) : (
                    <Button type="link" className="more-toggle" onClick={() => setMore(true)}>More: publisher and date</Button>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        <section className="add-section" aria-labelledby="add-take-title">
          <SectionHeading id="add-take-title">Your take</SectionHeading>
          <div className="take-row">
            <Form.Item name="read" label="Read" className="take-item">
              <ToggleIcon trueIcon={BookOpen} falseIcon={BookClosed} trueLabel="Read" falseLabel="Not read" size="large" className="toggle-read" />
            </Form.Item>
            {RATINGS.map(({ field, kind, label, filledIcon, unfilledIcon }) => (
              <Form.Item key={field} name={field} label={label} className="take-item">
                <Rating label={label} kind={kind} filledIcon={filledIcon} unfilledIcon={unfilledIcon} size="large" />
              </Form.Item>
            ))}
          </div>
        </section>

        <section className="add-section" aria-labelledby="add-synopsis-title">
          <SectionHeading id="add-synopsis-title">Synopsis</SectionHeading>
          <Form.Item name="synopsis" className="add-synopsis">
            <Input.TextArea autoSize={{ minRows: 4, maxRows: 14 }} aria-labelledby="add-synopsis-title" placeholder="What is it about?" />
          </Form.Item>
        </section>

        {conflict && (
          <div ref={conflictRef} className="add-book-conflict">
            <Alert
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
          </div>
        )}
        <div className="add-actions">
          <Button htmlType="button" type="text" onClick={reset}>Reset</Button>
          <Button type="primary" htmlType="submit" size="large" loading={saving} className="add-submit">Add book</Button>
        </div>
      </Form>
      <LookupCredit record={found} />
    </section>
  )
}

export default AddBook
