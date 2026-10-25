/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Alert, Button, Drawer, Skeleton } from 'antd'
import { BookmarkFilled, BookmarkOutline } from '../../images/index.js'
import { Sprig } from '../../images/ornaments/index.js'
import { useIsPhone } from '../../lib/viewport.js'
import BookDetail from './BookDetail.jsx'

const WishlistButton = ({ book, onSave }) => {
  const Icon = book.wishlist ? BookmarkFilled : BookmarkOutline
  return (
    <Button
      className={book.wishlist ? 'wishlist-button wishlist-button-on' : 'wishlist-button'}
      icon={<span className="anticon"><Icon aria-hidden="true" /></span>}
      aria-pressed={book.wishlist}
      onClick={() => onSave(book, { wishlist: !book.wishlist })}
    >
      {book.wishlist ? 'On the wishlist' : 'Add to wishlist'}
    </Button>
  )
}

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
      extra={book && <WishlistButton book={book} onSave={actions.onSave} />}
      destroyOnHidden
      className="book-drawer"
    >
      {!isPhone && <Sprig className="drawer-watermark" aria-hidden="true" />}
      {content}
    </Drawer>
  )
}

export default BookDrawer
