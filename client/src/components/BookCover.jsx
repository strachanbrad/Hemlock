/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { BookOutlined } from '@ant-design/icons'

// The box keeps its size whether or not the image exists or loads, so nothing reflows.
const BookCover = ({ url, title, size = 'small' }) => (
  <span className={`book-cover book-cover-${size}`}>
    {url ? <img src={url} alt={`Cover of ${title}`} loading="lazy" /> : <BookOutlined aria-label="No cover" />}
  </span>
)

export default BookCover
