/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useState } from 'react'
import { App, Button, Form, Input } from 'antd'
import { updateBook } from '../../api/books.js'
import AuthorSelect from '../../components/AuthorSelect.jsx'
import { SectionHeading } from '../../components/Headings.jsx'
import { authorPayload, collapse } from '../../lib/authors.js'

// Sends only the fields that changed; the view comes back only once the save succeeds.
const BookEditForm = ({ book, onSaved, onCancel }) => {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const submit = async ({ title, author, synopsis }) => {
    const changes = {}
    if (collapse(title) !== book.title) changes.title = collapse(title)
    if (author.id !== book.author.id) Object.assign(changes, authorPayload(author))
    if ((synopsis ?? '').trim() !== book.synopsis) changes.synopsis = (synopsis ?? '').trim()
    if (Object.keys(changes).length === 0) return onCancel()

    setSaving(true)
    try {
      onSaved(await updateBook(book.id, changes))
    } catch (err) {
      if (err.status === 409) form.setFields([{ name: 'title', errors: [err.message] }])
      else message.error(err.message)
      setSaving(false)
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      disabled={saving}
      initialValues={{ title: book.title, author: book.author, synopsis: book.synopsis }}
      onFinish={submit}
    >
      <SectionHeading>Edit the book</SectionHeading>
      <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, message: 'Enter a title' }]}>
        <Input maxLength={500} />
      </Form.Item>
      <Form.Item name="author" label="Author" rules={[{ required: true, message: 'Choose an author' }]}>
        <AuthorSelect />
      </Form.Item>
      <Form.Item name="synopsis" label="Synopsis">
        <Input.TextArea autoSize={{ minRows: 3, maxRows: 12 }} />
      </Form.Item>
      <div className="form-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="primary" htmlType="submit" loading={saving}>Save</Button>
      </div>
    </Form>
  )
}

export default BookEditForm
