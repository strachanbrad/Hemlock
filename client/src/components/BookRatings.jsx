/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { BookClosed, BookmarkFilled, BookmarkOutline, BookOpen, FilledChili, FilledKnife, FilledStar, UnfilledChili, UnfilledKnife, UnfilledStar } from '../images/index.js'
import Rating from './Rating.jsx'
import ToggleIcon from './ToggleIcon.jsx'

export const RATINGS = [
  { field: 'star_rating', kind: 'stars', label: 'Stars', filledIcon: FilledStar, unfilledIcon: UnfilledStar },
  { field: 'spice_rating', kind: 'spice', label: 'Spice', filledIcon: FilledChili, unfilledIcon: UnfilledChili },
  { field: 'gore_rating', kind: 'gore', label: 'Gore', filledIcon: FilledKnife, unfilledIcon: UnfilledKnife },
]

export const ratingFor = (field) => RATINGS.find((rating) => rating.field === field)

export const BookRating = ({ book, field, onSave, size }) => {
  const { label, kind, filledIcon, unfilledIcon } = ratingFor(field)
  return (
    <Rating
      value={book[field]}
      onChange={onSave ? (value) => onSave(book, { [field]: value }) : undefined}
      label={label}
      kind={kind}
      filledIcon={filledIcon}
      unfilledIcon={unfilledIcon}
      size={size}
    />
  )
}

export const ReadToggle = ({ book, onSave, size }) => (
  <ToggleIcon
    value={book.read}
    onChange={onSave ? (read) => onSave(book, { read }) : undefined}
    trueIcon={BookOpen}
    falseIcon={BookClosed}
    trueLabel="Read"
    falseLabel="Not read"
    size={size}
    className="toggle-read"
  />
)

export const WishlistToggle = ({ book, onSave, size }) => (
  <ToggleIcon
    value={book.wishlist}
    onChange={onSave ? (wishlist) => onSave(book, { wishlist }) : undefined}
    trueIcon={BookmarkFilled}
    falseIcon={BookmarkOutline}
    trueLabel="On the wishlist"
    falseLabel="Add to wishlist"
    size={size}
    className="toggle-wishlist"
  />
)

export const RatingSummary = ({ book }) => (
  <span className="rating-summary">
    {RATINGS.map(({ field, kind, label, filledIcon: Icon }) => (
      <span key={field} className={`rating-summary-item rating-${kind}`} role="img" aria-label={`${label}: ${book[field]} of 5`}>
        <Icon aria-hidden="true" />
        <span aria-hidden="true">{book[field]}</span>
      </span>
    ))}
  </span>
)
