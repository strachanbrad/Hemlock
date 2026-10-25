/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useState } from 'react'
import { App, Button, Popconfirm, Tag } from 'antd'
import { deleteEdition, updateEdition } from '../../api/editions.js'
import BookCover from '../../components/BookCover.jsx'
import { ChangeCoverButton } from '../../components/CoverPicker.jsx'
import { FORMAT_LABELS } from '../../components/FormatTags.jsx'
import { resizeCover } from '../../lib/resizeImage.js'

const EditionList = ({ book, onReplace, onEdit }) => {
  const { message } = App.useApp()
  const [busy, setBusy] = useState(null)

  const run = async (editionId, action) => {
    setBusy(editionId)
    try {
      onReplace(await action())
    } catch (err) {
      message.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  if (book.editions.length === 0) return <p className="secondary reading">On the wishlist: no editions yet.</p>

  return (
    <ul className="edition-list">
      {book.editions.map((edition) => (
        <li key={edition.id} className="edition-row">
          <BookCover url={edition.cover_url} title={`${book.title}, ${FORMAT_LABELS[edition.format]}`} />
          <div className="edition-info">
            <Tag className="format-tag">{FORMAT_LABELS[edition.format]}</Tag>
            <span className={edition.isbn ? 'edition-isbn' : 'edition-isbn secondary'}>{edition.isbn ?? 'No ISBN'}</span>
            {(edition.publisher || edition.published) && (
              <span className="secondary">{[edition.publisher, edition.published?.slice(0, 4)].filter(Boolean).join(', ')}</span>
            )}
          </div>
          <div className="edition-actions">
            <ChangeCoverButton
              type="text"
              busy={busy === edition.id}
              onFile={async (file) => run(edition.id, async () => updateEdition(edition.id, {}, await resizeCover(file)))}
            />
            <Button size="small" type="text" onClick={() => onEdit(edition)}>Edit</Button>
            <Popconfirm
              title="Delete this edition?"
              description={edition.cover_url ? 'Its cover is deleted with it.' : undefined}
              okText="Delete"
              okType="danger"
              onConfirm={() => run(edition.id, () => deleteEdition(edition.id))}
            >
              <Button size="small" type="text" danger>Delete</Button>
            </Popconfirm>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default EditionList
