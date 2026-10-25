/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import BookCover from '../src/components/BookCover.jsx'
import { WishlistToggle } from '../src/components/BookRatings.jsx'

describe('WishlistToggle', () => {
  it('saves the opposite wishlist flag for the book', () => {
    const onSave = vi.fn()
    const book = { id: 7, wishlist: false }
    const { rerender } = render(<WishlistToggle book={book} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to wishlist' }))
    expect(onSave).toHaveBeenLastCalledWith(book, { wishlist: true })

    const wished = { ...book, wishlist: true }
    rerender(<WishlistToggle book={wished} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'On the wishlist' }))
    expect(onSave).toHaveBeenLastCalledWith(wished, { wishlist: false })
  })
})

describe('BookCover without an image', () => {
  it('names the book and shows its initial when small and its title when large', () => {
    const { rerender } = render(<BookCover title="Emma" />)
    expect(screen.getByRole('img', { name: 'No cover: Emma' }).textContent).toBe('E')
    rerender(<BookCover title="Emma" size="large" />)
    expect(screen.getByRole('img', { name: 'No cover: Emma' }).textContent).toBe('Emma')
  })
})
