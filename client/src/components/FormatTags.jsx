/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Tag } from 'antd'

export const FORMAT_LABELS = { hardcover: 'Hardcover', paperback: 'Paperback', ebook: 'Ebook' }

const FormatTags = ({ book }) => (
  <span className="format-tags">
    {book.editions.map((edition) => <Tag key={edition.id} className="format-tag">{FORMAT_LABELS[edition.format]}</Tag>)}
    {book.editions.length === 0 && <Tag className="format-tag">Not owned</Tag>}
    {book.wishlist && <Tag color="magenta" className="format-tag">Wishlist</Tag>}
  </span>
)

export default FormatTags
