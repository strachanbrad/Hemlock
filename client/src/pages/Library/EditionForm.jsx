/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useState } from 'react'
import { App, Button, Form, Input, Radio } from 'antd'
import { CoverPicker } from '../../components/CoverPicker.jsx'
import { FORMAT_LABELS } from '../../components/FormatTags.jsx'
import IsbnField from '../../components/IsbnField.jsx'
import LookupCover from '../../components/LookupCover.jsx'
import { toIsbn13 } from '../../lib/isbn.js'
import { editionFromLookup } from '../../lib/prefill.js'
import { resizeCover } from '../../lib/resizeImage.js'
import '../../styles/forms.css'

export const PUBLISHED = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/
const FIELDS = ['format', 'isbn', 'publisher', 'published']

export const isbnRule = {
  validator: (_, value) => (!value?.trim() || toIsbn13(value) ? Promise.resolve() : Promise.reject(new Error('Not a valid ISBN-10 or ISBN-13'))),
}
export const publishedRule = { pattern: PUBLISHED, message: 'Use YYYY, YYYY-MM or YYYY-MM-DD' }

const formatOptions = (formats) => formats.map((format) => ({ value: format, label: FORMAT_LABELS[format] }))

const TITLES = { add: 'Add an edition', purchase: 'Mark as purchased', edit: 'Edit the edition' }

// mode is add, purchase (physical formats only) or edit; onSubmit(payload, file) saves, resolves to
// the book and may throw an ApiError.
const EditionForm = ({ mode, edition, onSubmit, onCancel }) => {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const cover = Form.useWatch('cover', form)
  const [more, setMore] = useState(Boolean(edition?.publisher || edition?.published))
  const [lookupCover, setLookupCover] = useState(null)
  const [saving, setSaving] = useState(false)
  const formats = mode === 'purchase' ? ['hardcover', 'paperback'] : ['hardcover', 'paperback', 'ebook']

  const prefill = (record, { scanned }) => {
    const values = editionFromLookup(record, { scanned, allowed: formats, currentFormat: form.getFieldValue('format') })
    form.setFieldsValue(values)
    if (values.publisher || values.published) setMore(true)
    setLookupCover(record.cover_url)
  }

  const submit = async (values) => {
    const entered = {
      format: values.format,
      isbn: values.isbn?.trim() ? toIsbn13(values.isbn) : null,
      publisher: values.publisher?.trim() || null,
      published: values.published?.trim() || null,
    }
    const payload = mode === 'edit'
      ? Object.fromEntries(FIELDS.filter((key) => entered[key] !== (edition[key] ?? null)).map((key) => [key, entered[key]]))
      : entered
    const coverUrl = !values.cover && lookupCover ? lookupCover : null
    if (coverUrl) payload.cover_from_url = coverUrl
    if (mode === 'edit' && Object.keys(payload).length === 0 && !values.cover) return onCancel()

    setSaving(true)
    try {
      const book = await onSubmit(payload, values.cover ? await resizeCover(values.cover) : null)
      if (coverUrl) {
        const saved = mode === 'edit' ? book.editions.find((e) => e.id === edition.id) : book.editions.reduce((a, b) => (b.id > a.id ? b : a))
        if (!saved?.cover_url || saved.cover_url === edition?.cover_url) message.warning('Saved without the cover: it could not be downloaded')
      }
    } catch (err) {
      const conflict = err.body?.conflict
      if (err.status === 409 && conflict && entered.isbn) form.setFields([{ name: 'isbn', errors: [err.message] }])
      else if (err.status === 409) form.setFields([{ name: 'format', errors: [err.message] }])
      else message.error(err.message)
      setSaving(false)
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      className="edition-form"
      disabled={saving}
      initialValues={{
        format: edition?.format,
        isbn: edition?.isbn ?? '',
        publisher: edition?.publisher ?? '',
        published: edition?.published ?? '',
        cover: null,
      }}
      onFinish={submit}
    >
      <h4 className="section-title">{TITLES[mode]}</h4>
      <Form.Item name="format" label="Format" rules={[{ required: true, message: 'Choose a format' }]}>
        <Radio.Group options={formatOptions(formats)} optionType="button" buttonStyle="solid" />
      </Form.Item>
      <Form.Item name="isbn" label="ISBN" rules={[isbnRule]} extra={mode === 'purchase' ? 'ISBN-10 or ISBN-13; scan the barcode or type it' : 'ISBN-10 or ISBN-13; leave empty for a store-only ebook'}>
        <IsbnField onFound={prefill} />
      </Form.Item>
      <Form.Item name="cover" label={mode === 'edit' && edition?.cover_url ? 'Replace the cover' : 'Cover'}>
        <CoverPicker />
      </Form.Item>
      {lookupCover && !cover && <LookupCover url={lookupCover} onRemove={() => setLookupCover(null)} />}
      {more ? (
        <>
          <Form.Item name="publisher" label="Publisher"><Input maxLength={200} /></Form.Item>
          <Form.Item name="published" label="Published" rules={[publishedRule]}><Input placeholder="YYYY-MM-DD" inputMode="numeric" /></Form.Item>
        </>
      ) : (
        <Button type="link" className="more-toggle" onClick={() => setMore(true)}>More: publisher and date</Button>
      )}
      <div className="form-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="primary" htmlType="submit" loading={saving}>Save</Button>
      </div>
    </Form>
  )
}

export default EditionForm
