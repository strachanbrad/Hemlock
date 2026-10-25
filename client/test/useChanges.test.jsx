/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { liveUpdatesSupported, watchChanges } from '../src/api/events.js'
import { COALESCE_MS, useChanges } from '../src/lib/useChanges.js'
import { stubEventSource } from './eventSource.js'

const wrapper = ({ children }) => <StrictMode>{children}</StrictMode>

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('watchChanges', () => {
  it('reports no live updates and returns a close that does nothing without EventSource', () => {
    expect(globalThis.EventSource).toBeUndefined()
    expect(liveUpdatesSupported()).toBe(false)
    const onChange = vi.fn()
    const close = watchChanges(onChange)
    expect(() => close()).not.toThrow()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('opens /api/events and tells a change from a reconnect', () => {
    const { sources } = stubEventSource()
    const onChange = vi.fn()
    const close = watchChanges(onChange)
    expect(sources.map((source) => source.url)).toEqual(['/api/events'])
    sources[0].emit('open')
    expect(onChange).not.toHaveBeenCalled()
    sources[0].emit('changed')
    expect(onChange).toHaveBeenLastCalledWith('changed')
    sources[0].emit('error', 0)
    sources[0].emit('open')
    expect(onChange).toHaveBeenLastCalledWith('reconnected')
    expect(onChange).toHaveBeenCalledTimes(2)
    close()
    expect(sources[0].closed).toBe(true)
  })

  it('replaces a source the browser gave up on, and counts its open as a reconnect', () => {
    const { sources, FakeEventSource } = stubEventSource()
    const onChange = vi.fn()
    const close = watchChanges(onChange)
    sources[0].emit('open')
    sources[0].emit('error', FakeEventSource.CONNECTING)
    vi.advanceTimersByTime(60_000)
    expect(sources).toHaveLength(1)

    sources[0].emit('error', FakeEventSource.CLOSED)
    vi.advanceTimersByTime(4999)
    expect(sources).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sources).toHaveLength(2)
    sources[1].emit('open')
    expect(onChange).toHaveBeenCalledExactlyOnceWith('reconnected')

    sources[1].emit('error', FakeEventSource.CLOSED)
    close()
    vi.advanceTimersByTime(60_000)
    expect(sources).toHaveLength(2)
    expect(sources[1].closed).toBe(true)
    sources[1].emit('error', FakeEventSource.CLOSED)
    vi.advanceTimersByTime(60_000)
    expect(sources).toHaveLength(2)
  })

  it('counts the first open as a reconnect when the stream failed before it', () => {
    const { sources, FakeEventSource } = stubEventSource()
    const onChange = vi.fn()
    const close = watchChanges(onChange)
    sources[0].emit('error', FakeEventSource.CONNECTING)
    sources[0].emit('open')
    expect(onChange).toHaveBeenCalledExactlyOnceWith('reconnected')
    close()
  })
})

describe('useChanges', () => {
  it('calls once per burst after the window, not for the first open, and again on a reconnect', () => {
    const { live } = stubEventSource()
    const callback = vi.fn()
    const { result } = renderHook(() => useChanges(callback), { wrapper })
    expect(result.current).toBe(true)
    expect(live()).toHaveLength(1)
    const source = live()[0]

    source.emit('open')
    act(() => vi.advanceTimersByTime(COALESCE_MS))
    expect(callback).not.toHaveBeenCalled()

    source.emit('changed')
    act(() => vi.advanceTimersByTime(COALESCE_MS - 100))
    source.emit('changed')
    act(() => vi.advanceTimersByTime(99))
    expect(callback).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(callback).toHaveBeenCalledTimes(1)

    source.emit('open')
    act(() => vi.advanceTimersByTime(COALESCE_MS))
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('calls the newest callback it was given', () => {
    const { sources, live } = stubEventSource()
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ callback }) => useChanges(callback), { wrapper, initialProps: { callback: first } })
    const opened = sources.length
    rerender({ callback: second })
    expect(sources).toHaveLength(opened)
    live()[0].emit('changed')
    act(() => vi.advanceTimersByTime(COALESCE_MS))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(live()).toHaveLength(1)
  })

  it('closes the stream and drops a pending call on unmount', () => {
    const { sources, live } = stubEventSource()
    const callback = vi.fn()
    const { unmount } = renderHook(() => useChanges(callback), { wrapper })
    live()[0].emit('changed')
    unmount()
    expect(live()).toEqual([])
    expect(sources.length).toBeGreaterThan(0)
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(COALESCE_MS))
    expect(callback).not.toHaveBeenCalled()
  })

  it('answers false without EventSource', () => {
    const { result } = renderHook(() => useChanges(() => {}), { wrapper })
    expect(result.current).toBe(false)
  })
})
