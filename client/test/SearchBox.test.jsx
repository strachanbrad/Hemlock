/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import SearchBox from '../src/pages/Library/SearchBox.jsx'

// The parent applies a reported text later, as the router's transition does.
function mount(value = '') {
  const onChange = vi.fn()
  const ui = (current) => <StrictMode><SearchBox value={current} onChange={onChange} /></StrictMode>
  const result = render(ui(value))
  return { onChange, apply: (next) => result.rerender(ui(next)) }
}

const box = () => screen.getByRole('searchbox')
const type = (text) => fireEvent.change(box(), { target: { value: text } })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('SearchBox', () => {
  it('reports the text once typing pauses', () => {
    const { onChange } = mount()
    type('p')
    type('pe')
    act(() => vi.advanceTimersByTime(249))
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('pe')
  })

  it('keeps a keystroke typed before its reported text is applied', () => {
    const { onChange, apply } = mount()
    type('pe')
    act(() => vi.advanceTimersByTime(250))
    type('per')
    apply('pe')
    expect(box().value).toBe('per')
    act(() => vi.advanceTimersByTime(250))
    expect(onChange).toHaveBeenLastCalledWith('per')
  })

  it('takes a value set from outside', () => {
    const { apply } = mount('emma')
    type('emm')
    apply('')
    expect(box().value).toBe('')
  })
})
