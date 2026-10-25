/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Rating from '../src/components/Rating.jsx'
import { FilledStar, UnfilledStar } from '../src/images/index.js'

const Filled = () => <svg data-testid="filled" />
const Unfilled = () => <svg data-testid="unfilled" />

const props = { filledIcon: Filled, unfilledIcon: Unfilled, label: 'Stars' }

describe('Rating', () => {
  it('renders five of the SVG icons imported with ?react', () => {
    const { container } = render(<Rating value={2} filledIcon={FilledStar} unfilledIcon={UnfilledStar} label="Stars" />)
    expect(container.querySelectorAll('svg')).toHaveLength(5)
  })

  it('fills as many icons as the value, out of five', () => {
    render(<Rating value={2} {...props} />)
    expect(screen.getAllByTestId('filled')).toHaveLength(2)
    expect(screen.getAllByTestId('unfilled')).toHaveLength(3)
  })

  it('shows a new value when the parent re-renders it', () => {
    const { rerender } = render(<Rating value={2} {...props} />)
    rerender(<Rating value={4} {...props} />)
    expect(screen.getAllByTestId('filled')).toHaveLength(4)
  })

  it('reports the tapped value and leaves the display to the parent', () => {
    const onChange = vi.fn()
    render(<Rating value={1} onChange={onChange} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stars 4 of 5' }))
    expect(onChange).toHaveBeenLastCalledWith(4)
    expect(screen.getAllByTestId('filled')).toHaveLength(1)
  })

  it('clears a rating of one when the first icon is tapped again', () => {
    const onChange = vi.fn()
    render(<Rating value={1} onChange={onChange} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stars 1 of 5' }))
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('sets one, not zero, when the first icon is tapped on a higher rating', () => {
    const onChange = vi.fn()
    render(<Rating value={3} onChange={onChange} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stars 1 of 5' }))
    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  it('keeps a tap from reaching the row underneath', () => {
    const onRow = vi.fn()
    render(<div onClick={onRow}><Rating value={0} onChange={() => {}} {...props} /></div>)
    fireEvent.click(screen.getByRole('button', { name: 'Stars 2 of 5' }))
    expect(onRow).not.toHaveBeenCalled()
  })

  it('is read-only without onChange: no buttons, and the value in its label', () => {
    render(<Rating value={3} {...props} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByRole('img', { name: 'Stars: 3 of 5' })).toBeTruthy()
  })

  it('gives each tap target the large size class for a phone', () => {
    render(<Rating value={0} onChange={() => {}} size="large" {...props} />)
    expect(screen.getByRole('group', { name: 'Stars' }).className).toContain('rating-large')
  })
})
