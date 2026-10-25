/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Table } from 'antd'
import { Link } from 'react-router'
import BookCover from '../../components/BookCover.jsx'
import { BookRating, ReadToggle, WishlistToggle } from '../../components/BookRatings.jsx'
import FormatTags from '../../components/FormatTags.jsx'
import { byAuthor, byTitle } from './filters.js'

const formatsText = (book) => book.editions.map((edition) => edition.format).join(' ') + (book.wishlist ? ' wishlist' : '')
const rating = (field, title, onSave) => ({
  key: field,
  title,
  sorter: (a, b) => a[field] - b[field] || byTitle(a, b),
  render: (_, book) => <BookRating book={book} field={field} onSave={onSave} size="small" />,
})

const stop = (event) => event.stopPropagation()

const LibraryTable = ({ books, linkTo, onOpen, onSave, loading }) => {
  const columns = [
    {
      key: 'cover',
      title: <span className="visually-hidden">Cover</span>,
      className: 'col-cover',
      render: (_, book) => <BookCover url={book.cover_url} title={book.title} />,
    },
    {
      key: 'title',
      title: 'Title',
      sorter: byTitle,
      defaultSortOrder: 'ascend',
      render: (_, book) => <Link to={linkTo(book.id)} state={{ fromList: true }} onClick={stop} className="table-title">{book.title}</Link>,
    },
    { key: 'author', title: 'Author', sorter: byAuthor, render: (_, book) => <span className="table-author">{book.author.name}</span> },
    {
      key: 'formats',
      title: 'Formats',
      sorter: (a, b) => formatsText(a).localeCompare(formatsText(b)) || byTitle(a, b),
      render: (_, book) => (
        <span className="table-formats">
          <WishlistToggle book={book} onSave={onSave} size="small" />
          <FormatTags book={book} />
        </span>
      ),
    },
    { key: 'read', title: 'Read', sorter: (a, b) => a.read - b.read || byTitle(a, b), render: (_, book) => <ReadToggle book={book} onSave={onSave} size="small" /> },
    rating('star_rating', 'Stars', onSave),
    rating('spice_rating', 'Spice', onSave),
    rating('gore_rating', 'Gore', onSave),
    {
      key: 'added',
      title: 'Added',
      className: 'col-added',
      sorter: (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
      render: (_, book) => book.created_at.slice(0, 10),
    },
  ]

  return (
    <Table
      className="library-table"
      rowKey="id"
      columns={columns}
      dataSource={books}
      loading={loading}
      size="small"
      scroll={{ x: 1000 }}
      pagination={{ pageSize: 25, showSizeChanger: false, hideOnSinglePage: true }}
      onRow={(book) => ({ onClick: () => onOpen(book.id), className: 'clickable-row' })}
    />
  )
}

export default LibraryTable
