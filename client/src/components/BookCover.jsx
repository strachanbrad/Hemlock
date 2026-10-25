/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Umbel } from '../images/ornaments/index.js'

const initialOf = (title) => title.match(/[\p{L}\p{N}]/u)?.[0] ?? ''

// The box keeps its size whether or not the image exists or loads, so nothing reflows.
const BookCover = ({ url, title, size = 'small' }) => {
  if (url) {
    return (
      <span className={`book-cover book-cover-${size}`}>
        <img src={url} alt={`Cover of ${title}`} loading="lazy" />
      </span>
    )
  }
  return (
    <span className={`book-cover book-cover-${size} book-cover-cloth`} role="img" aria-label={`No cover: ${title}`}>
      {size === 'large' || size === 'flow'
        ? <span className="cover-title" aria-hidden="true">{title}</span>
        : <span className="cover-initial" aria-hidden="true">{initialOf(title)}</span>}
      <Umbel className="cover-umbel" aria-hidden="true" />
    </span>
  )
}

export default BookCover
