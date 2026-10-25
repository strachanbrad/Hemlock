/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Button } from 'antd'
import { Link } from 'react-router'
import BookCover from '../../components/BookCover.jsx'
import { RatingSummary, ReadToggle } from '../../components/BookRatings.jsx'
import FormatTags from '../../components/FormatTags.jsx'

const stop = (event) => event.stopPropagation()

// Ratings are read-only here: a tap on a scrolling list would mis-rate. They are edited in the detail.
const LibraryCards = ({ books, linkTo, onOpen, onSave, onPurchase }) => (
  <ul className="book-cards">
    {books.map((book) => (
      <li key={book.id} className="book-card" onClick={() => onOpen(book.id)}>
        <BookCover url={book.cover_url} title={book.title} size="card" />
        <div className="book-card-body">
          <Link to={linkTo(book.id)} state={{ fromList: true }} onClick={stop} className="book-card-title">{book.title}</Link>
          <span className="book-card-author">{book.author.name}</span>
          <div className="book-card-row">
            <FormatTags book={book} />
            <ReadToggle book={book} onSave={onSave} size="large" />
          </div>
          <div className="book-card-row">
            <RatingSummary book={book} />
            {onPurchase && book.wishlist && (
              <Button size="small" onClick={(event) => { stop(event); onPurchase(book) }}>Purchased</Button>
            )}
          </div>
        </div>
      </li>
    ))}
  </ul>
)

export default LibraryCards
