/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Tag } from 'antd'

export const FORMAT_LABELS = { hardcover: 'Hardcover', paperback: 'Paperback', ebook: 'Ebook' }

// The wishlist shows as its own toggle beside these tags, so a book with no edition shows none.
const FormatTags = ({ book }) => (
  <span className="format-tags">
    {book.editions.map((edition) => <Tag key={edition.id} className="format-tag">{FORMAT_LABELS[edition.format]}</Tag>)}
  </span>
)

export default FormatTags
