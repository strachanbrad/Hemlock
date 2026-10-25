/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ToggleIcon from '../src/components/ToggleIcon.jsx'

const Open = () => <svg data-testid="open" />
const Closed = () => <svg data-testid="closed" />
const props = { trueIcon: Open, falseIcon: Closed, trueLabel: 'Read', falseLabel: 'Not read' }

describe('ToggleIcon', () => {
  it('shows the true icon for true and the false icon for false', () => {
    const { rerender } = render(<ToggleIcon value {...props} />)
    expect(screen.getByTestId('open')).toBeTruthy()
    rerender(<ToggleIcon value={false} {...props} />)
    expect(screen.getByTestId('closed')).toBeTruthy()
  })

  it('shows the false icon when no value is given', () => {
    render(<ToggleIcon {...props} />)
    expect(screen.getByTestId('closed')).toBeTruthy()
  })

  it('reports the opposite boolean on a tap and leaves the display to the parent', () => {
    const onChange = vi.fn()
    const { rerender } = render(<ToggleIcon value={false} onChange={onChange} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not read' }))
    expect(onChange).toHaveBeenLastCalledWith(true)
    expect(screen.getByTestId('closed')).toBeTruthy()

    rerender(<ToggleIcon value onChange={onChange} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('keeps a tap from reaching the row underneath', () => {
    const onRow = vi.fn()
    render(<div onClick={onRow}><ToggleIcon value={false} onChange={() => {}} {...props} /></div>)
    fireEvent.click(screen.getByRole('button'))
    expect(onRow).not.toHaveBeenCalled()
  })

  it('is read-only without onChange', () => {
    render(<ToggleIcon value {...props} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('img', { name: 'Read' })).toBeTruthy()
  })
})
