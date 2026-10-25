/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import Rating from '../src/components/Rating.jsx'
import { FilledStar, UnfilledStar } from '../src/images/index.js'

const Filled = () => <svg data-testid="filled" />
const Unfilled = () => <svg data-testid="unfilled" />

const renderRating = (props) => render(
  <Rating filledSVG={Filled} unfilledSVG={Unfilled} height={16} color="#000" {...props} />
)

describe('Rating', () => {
  it('renders five of the SVG icons imported with ?react', () => {
    const { container } = render(<Rating initialRating={2} filledSVG={FilledStar} unfilledSVG={UnfilledStar} height={16} />)
    expect(container.querySelectorAll('svg')).toHaveLength(5)
  })

  it('fills as many icons as the rating, out of five', () => {
    const { getAllByTestId } = renderRating({ initialRating: 2 })
    expect(getAllByTestId('filled')).toHaveLength(2)
    expect(getAllByTestId('unfilled')).toHaveLength(3)
  })

  it('reports and shows the clicked rating when interactive', () => {
    const onRatingChange = vi.fn()
    const { getAllByTestId, queryAllByTestId } = renderRating({ initialRating: 1, isInteractive: true, onRatingChange })
    fireEvent.click(getAllByTestId('unfilled')[2].parentElement)
    expect(onRatingChange).toHaveBeenLastCalledWith(4)
    expect(queryAllByTestId('filled')).toHaveLength(4)
  })

  it('clears a rating of one when the first icon is clicked again', () => {
    const onRatingChange = vi.fn()
    const { getAllByTestId, queryAllByTestId } = renderRating({ initialRating: 1, isInteractive: true, onRatingChange })
    fireEvent.click(getAllByTestId('filled')[0].parentElement)
    expect(onRatingChange).toHaveBeenLastCalledWith(0)
    expect(queryAllByTestId('filled')).toHaveLength(0)
  })

  it('ignores clicks when read-only', () => {
    const onRatingChange = vi.fn()
    const { getAllByTestId } = renderRating({ initialRating: 3, isInteractive: false, onRatingChange })
    fireEvent.click(getAllByTestId('unfilled')[0].parentElement)
    expect(onRatingChange).not.toHaveBeenCalled()
    expect(getAllByTestId('filled')).toHaveLength(3)
  })
})
