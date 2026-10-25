/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useEffect, useMemo, useState } from 'react'
import { Alert, App, Button, Input, Popconfirm, Table, Tooltip } from 'antd'
import { DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons'
import { Link } from 'react-router'
import { deleteAuthor, listAuthors, renameAuthor } from '../../api/authors.js'
import { collapse } from '../../lib/authors.js'
import { useIsPhone } from '../../lib/viewport.js'
import '../../styles/authors.css'

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id
const libraryOf = (author) => ({ pathname: '/library', search: `?author_id=${author.id}` })

const RenameField = ({ author, onSave, onCancel }) => {
  const [name, setName] = useState(author.name)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!collapse(name)) return setError('Enter a name')
    if (collapse(name) === author.name) return onCancel()
    setSaving(true)
    try {
      await onSave(author, collapse(name))
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="rename-field">
      <Input
        aria-label={`New name for ${author.name}`}
        value={name}
        status={error ? 'error' : undefined}
        disabled={saving}
        autoFocus
        maxLength={200}
        onChange={(event) => { setName(event.target.value); setError(null) }}
        onPressEnter={save}
        onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }}
      />
      <div className="rename-actions">
        <Button size="small" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="small" type="primary" onClick={save} loading={saving}>Save</Button>
      </div>
      {error && <div className="rename-error" role="alert">{error}</div>}
    </div>
  )
}

const AuthorActions = ({ author, onRename, onDelete }) => (
  <span className="author-actions">
    <Tooltip title="Rename">
      <Button className="icon-button" icon={<EditOutlined />} aria-label={`Rename ${author.name}`} onClick={() => onRename(author)} />
    </Tooltip>
    {author.book_count === 0 ? (
      <Popconfirm title={`Delete ${author.name}?`} okText="Delete" okType="danger" onConfirm={() => onDelete(author)}>
        <Button className="icon-button" danger icon={<DeleteOutlined />} aria-label={`Delete ${author.name}`} />
      </Popconfirm>
    ) : (
      <Tooltip title="An author with books cannot be deleted">
        <Button className="icon-button" danger disabled icon={<DeleteOutlined />} aria-label={`Delete ${author.name}`} />
      </Tooltip>
    )}
  </span>
)

const Authors = () => {
  const { message } = App.useApp()
  const isPhone = useIsPhone()
  const [state, setState] = useState({ authors: null, error: null })
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    listAuthors({ signal: controller.signal })
      .then((authors) => setState({ authors, error: null }))
      .catch((err) => {
        if (!controller.signal.aborted) setState({ authors: [], error: err.message })
      })
    return () => controller.abort()
  }, [])

  const shown = useMemo(() => {
    const needle = collapse(search).toLocaleLowerCase()
    return (state.authors ?? []).filter((author) => author.name.toLocaleLowerCase().includes(needle))
  }, [state.authors, search])

  const rename = async (author, name) => {
    const saved = await renameAuthor(author.id, name)
    setState((prev) => ({ ...prev, authors: prev.authors.map((a) => (a.id === saved.id ? saved : a)).sort(byName) }))
    setEditingId(null)
    message.success(`Renamed to ${saved.name}`)
  }

  const remove = async (author) => {
    try {
      await deleteAuthor(author.id)
      setState((prev) => ({ ...prev, authors: prev.authors.filter((a) => a.id !== author.id) }))
      message.success(`Deleted ${author.name}`)
    } catch (err) {
      message.error(err.message)
    }
  }

  const nameCell = (author) => (editingId === author.id
    ? <RenameField author={author} onSave={rename} onCancel={() => setEditingId(null)} />
    : <Link to={libraryOf(author)} className="author-name">{author.name}</Link>)
  const actions = (author) => <AuthorActions author={author} onRename={(a) => setEditingId(a.id)} onDelete={remove} />

  let body
  if (state.error) {
    body = <Alert type="error" showIcon title="Could not load the authors" description={state.error} />
  } else if (isPhone) {
    body = (
      <ul className="author-list">
        {shown.map((author) => (
          <li key={author.id} className="author-row">
            <div className="author-row-main">
              {nameCell(author)}
              {editingId !== author.id && <span className="secondary">{author.book_count === 1 ? '1 book' : `${author.book_count} books`}</span>}
            </div>
            {editingId !== author.id && actions(author)}
          </li>
        ))}
        {state.authors && shown.length === 0 && <li className="secondary">No authors match.</li>}
      </ul>
    )
  } else {
    body = (
      <Table
        rowKey="id"
        loading={state.authors === null}
        size="small"
        dataSource={shown}
        pagination={{ pageSize: 50, showSizeChanger: false, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
        columns={[
          { key: 'name', title: 'Name', sorter: byName, defaultSortOrder: 'ascend', render: (_, author) => nameCell(author) },
          { key: 'books', title: 'Books', sorter: (a, b) => a.book_count - b.book_count || byName(a, b), render: (_, author) => author.book_count },
          { key: 'actions', title: <span className="visually-hidden">Actions</span>, render: (_, author) => actions(author) },
        ]}
      />
    )
  }

  return (
    <section className="authors">
      <h2 className="page-title">Authors</h2>
      <Input
        className="authors-search"
        type="search"
        allowClear
        prefix={<SearchOutlined aria-hidden="true" />}
        placeholder="Search authors"
        aria-label="Search authors"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {body}
    </section>
  )
}

export default Authors
