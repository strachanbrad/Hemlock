/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Alert, Drawer, Skeleton } from 'antd'
import { useIsPhone } from '../../lib/viewport.js'
import BookDetail from './BookDetail.jsx'

const BookDrawer = ({ open, bookId, book, loaded, error, initialMode, onClose, ...actions }) => {
  const isPhone = useIsPhone()
  let content = <Skeleton active />
  if (book) content = <BookDetail key={bookId} book={book} loaded={loaded} initialMode={initialMode} {...actions} />
  else if (error) content = <Alert type="error" showIcon title="Could not open the book" description={error} />

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={isPhone ? '100%' : 640}
      title={book?.title ?? 'Book'}
      destroyOnHidden
      className="book-drawer"
    >
      {content}
    </Drawer>
  )
}

export default BookDrawer
