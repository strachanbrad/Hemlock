/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { BookClosed, BookOpen, FilledChili, FilledKnife, FilledStar, UnfilledChili, UnfilledKnife, UnfilledStar } from '../images/index.js'
import Rating from './Rating.jsx'
import ToggleIcon from './ToggleIcon.jsx'

export const RATINGS = [
  { field: 'star_rating', label: 'Stars', filledIcon: FilledStar, unfilledIcon: UnfilledStar },
  { field: 'spice_rating', label: 'Spice', filledIcon: FilledChili, unfilledIcon: UnfilledChili },
  { field: 'gore_rating', label: 'Gore', filledIcon: FilledKnife, unfilledIcon: UnfilledKnife },
]

export const ratingFor = (field) => RATINGS.find((rating) => rating.field === field)

export const BookRating = ({ book, field, onSave, size }) => {
  const { label, filledIcon, unfilledIcon } = ratingFor(field)
  return (
    <Rating
      value={book[field]}
      onChange={onSave ? (value) => onSave(book, { [field]: value }) : undefined}
      label={label}
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
  />
)

// The compact, read-only form for a card: one filled icon and the number.
export const RatingSummary = ({ book }) => (
  <span className="rating-summary">
    {RATINGS.map(({ field, label, filledIcon: Icon }) => (
      <span key={field} className="rating-summary-item" role="img" aria-label={`${label}: ${book[field]} of 5`}>
        <Icon aria-hidden="true" />
        <span aria-hidden="true">{book[field]}</span>
      </span>
    ))}
  </span>
)
