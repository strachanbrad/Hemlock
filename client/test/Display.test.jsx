/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Display from '../src/pages/Display/Display.jsx'
import { stubEventSource } from './eventSource.js'

const T0 = 1_700_000_000_000
const OWN_EVENTS = ['keydown', 'pointermove', 'pointerdown', 'visibilitychange', 'fullscreenchange']

const books = (...titles) => titles.map((title) => ({
  id: `b-${title}`, title, author: 'Jane Austen', synopsis: `About ${title}.`, cover_url: null,
  format: 'paperback', read: false, star_rating: 3, spice_rating: 1, gore_rating: 2,
}))

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) })
const failure = () => ({ ok: false, status: 502, json: async () => { throw new Error('html') }, text: async () => '<html></html>' })
const signIn = () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in' }), text: async () => '{"error":"Sign in"}' })
// Signed in: the session check answers a name, and handler answers everything else.
const serve = (handler) => vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (url === '/api/session' ? ok({ name: 'Ana' }) : handler(url)))

// Lets the mocked fetch chain resolve and React commit what it set.
const flush = () => act(async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
})
const advance = async (ms) => {
  act(() => vi.advanceTimersByTime(ms))
  await flush()
}
const mount = async () => {
  const result = render(<StrictMode><MemoryRouter><Display /></MemoryRouter></StrictMode>)
  await flush()
  return result
}
const titleOf = (container) => container.querySelector('.display-slide.is-current .display-title')?.textContent ?? null

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(T0)
  window.history.replaceState(null, '', '/display')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete navigator.wakeLock
  delete document.fullscreenEnabled
  delete document.documentElement.requestFullscreen
})

describe('Display', () => {
  it('shows only the sign-in screen without a session, with no stream, no list and no timer', async () => {
    const { sources } = stubEventSource()
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => signIn())
    const { container, getByRole } = await mount()
    expect(getByRole('link', { name: 'Sign in to show the library' }).getAttribute('href')).toBe('/login?next=/display')
    expect(container.querySelector('.display-slide')).toBeNull()
    expect(sources).toEqual([])
    await advance(10 * 60 * 1000)
    expect(new Set(fetch.mock.calls.map(([url]) => url))).toEqual(new Set(['/api/session']))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('turns to the sign-in screen when a fetch answers 401, closing the stream', async () => {
    const { live } = stubEventSource()
    let signedIn = true
    const fetch = serve(() => (signedIn ? ok(books('Alpha', 'Beta')) : signIn()))
    const { container, queryByRole } = await mount()
    expect(titleOf(container)).toBe('Alpha')
    signedIn = false
    live()[0].emit('changed')
    await advance(300)
    expect(queryByRole('link', { name: 'Sign in to show the library' })).not.toBeNull()
    expect(container.querySelector('.display-slide')).toBeNull()
    expect(live()).toEqual([])
    const calls = fetch.mock.calls.length
    await advance(60 * 1000)
    expect(fetch.mock.calls.length).toBe(calls)
  })

  it('starts the slideshow when the session check cannot reach the server, and retries the list', async () => {
    let up = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (up ? ok(books('Alpha')) : failure()))
    const { container, queryByText } = await mount()
    expect(queryByText('Cannot reach the library. Retrying.')).not.toBeNull()
    up = true
    await advance(30_000)
    expect(titleOf(container)).toBe('Alpha')
  })

  it('shows the first book, then the next one after ten seconds', async () => {
    serve(() => ok(books('Alpha', 'Beta', 'Gamma')))
    const { container } = await mount()
    expect(titleOf(container)).toBe('Alpha')
    await advance(9500)
    expect(titleOf(container)).toBe('Alpha')
    await advance(500)
    expect(titleOf(container)).toBe('Beta')
  })

  it('keeps the previous, current and next books in the DOM', async () => {
    serve(() => ok(books('Alpha', 'Beta', 'Gamma', 'Delta')))
    const { container } = await mount()
    await advance(10_000)
    const titles = [...container.querySelectorAll('.display-slide .display-title')].map((node) => node.textContent)
    expect(titles).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('catches up on visibilitychange after the clock moved on with no tick', async () => {
    const list = books('A', 'B', 'C', 'D', 'E', 'F', 'G')
    serve(() => ok(list))
    const { container } = await mount()
    vi.setSystemTime(T0 + 60 * 60 * 1000)
    expect(titleOf(container)).toBe('A')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(titleOf(container)).toBe(list[360 % 7].title)
  })

  it('keeps the book on screen when the five-minute refetch changes the list', async () => {
    let list = books('Alpha', 'Beta', 'Gamma')
    const fetch = serve(() => ok(list))
    const { container } = await mount()
    const calls = fetch.mock.calls.length
    list = books('Aardvark', 'Alpha', 'Beta', 'Gamma')
    await advance(5 * 60 * 1000)
    expect(fetch.mock.calls.length).toBe(calls + 1)
    expect(titleOf(container)).toBe('Alpha')
    await advance(10_000)
    expect(titleOf(container)).toBe('Beta')
  })

  it('fetches again when the library changes, keeping the book on screen, and never polls', async () => {
    const { live } = stubEventSource()
    let list = books('Alpha', 'Beta', 'Gamma')
    const fetch = serve(() => ok(list))
    const { container } = await mount()
    const calls = fetch.mock.calls.length
    live()[0].emit('open')
    await advance(4000)

    list = books('Aardvark', 'Alpha', 'Gamma')
    live()[0].emit('changed')
    await advance(300)
    expect(fetch.mock.calls.length).toBe(calls + 1)
    expect(titleOf(container)).toBe('Alpha')
    await advance(5700)
    expect(titleOf(container)).toBe('Gamma')

    await advance(10 * 60 * 1000)
    expect(fetch.mock.calls.length).toBe(calls + 1)
    live()[0].emit('error')
    live()[0].emit('open')
    await advance(300)
    expect(fetch.mock.calls.length).toBe(calls + 2)
  })

  it('shows a retry notice when the first load fails and the books once a retry succeeds', async () => {
    let failing = true
    serve(() => (failing ? failure() : ok(books('Alpha'))))
    const { container, queryByText } = await mount()
    expect(queryByText('Cannot reach the library. Retrying.')).not.toBeNull()
    failing = false
    await advance(30_000)
    expect(queryByText('Cannot reach the library. Retrying.')).toBeNull()
    expect(titleOf(container)).toBe('Alpha')
  })

  it('keeps the last list when a refetch fails', async () => {
    let failing = false
    serve(() => (failing ? failure() : ok(books('Alpha', 'Beta'))))
    const { container, queryByText } = await mount()
    failing = true
    await advance(5 * 60 * 1000)
    expect(queryByText('Cannot reach the library. Retrying.')).toBeNull()
    expect(titleOf(container)).toBe('Alpha')
  })

  it('says so when there are no books', async () => {
    serve(() => ok([]))
    const { getByText } = await mount()
    expect(getByText('No books to show.')).not.toBeNull()
  })

  it('asks for the filter in the address and shows spice and gore only with ratings=all', async () => {
    const fetch = serve(() => ok(books('Alpha')))
    const { container, unmount } = await mount()
    expect(fetch).toHaveBeenLastCalledWith('/api/display', expect.anything())
    expect(container.querySelector('.display-slide.is-current .display-meta').textContent).not.toContain('Spice')
    unmount()

    window.history.replaceState(null, '', '/display?filter=unread&ratings=all')
    const again = await mount()
    expect(fetch).toHaveBeenLastCalledWith('/api/display?filter=unread', expect.anything())
    const meta = again.container.querySelector('.display-slide.is-current .display-meta').textContent
    expect(meta).toContain('Paperback')
    expect(meta).toContain('Spice 1/5')
    expect(meta).toContain('Gore 2/5')
  })

  it('draws blood by gore and a chilli by spice on the cover, and neither with effects=off', async () => {
    const [clean, heavy] = books('Clean', 'Heavy')
    serve(() => ok([{ ...clean, gore_rating: 0, spice_rating: 0 }, { ...heavy, gore_rating: 5, spice_rating: 2 }]))
    const { container, unmount } = await mount()
    const current = (selector) => container.querySelector(`.display-slide.is-current ${selector}`)
    expect(titleOf(container)).toBe('Clean')
    expect(current('.display-blood')).toBeNull()
    expect(current('.display-chilli')).toBeNull()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(titleOf(container)).toBe('Heavy')
    expect(current('.display-blood').dataset.level).toBe('5')
    expect(current('.display-blood').getAttribute('viewBox')).toBe('0 0 100 150')
    expect(container.querySelectorAll('.display-slide.is-current .display-blood-body .display-blood-pool')).toHaveLength(2)
    expect(current('.display-chilli').dataset.level).toBe('2')
    unmount()

    window.history.replaceState(null, '', '/display?effects=off')
    const off = await mount()
    expect(off.container.querySelectorAll('.display-slide')).toHaveLength(2)
    expect(off.container.querySelector('.display-blood, .display-chilli')).toBeNull()
  })

  it('fits the effects to the cover image once it loads, and to the cloth cover when it fails', async () => {
    const [book] = books('Covered')
    serve(() => ok([{ ...book, cover_url: '/covers/c.jpg', gore_rating: 3, spice_rating: 4 }]))
    const { container } = await mount()
    const img = container.querySelector('.display-cover img')
    expect(container.querySelector('.display-blood, .display-chilli')).toBeNull()

    Object.defineProperty(img, 'naturalWidth', { value: 300 })
    Object.defineProperty(img, 'naturalHeight', { value: 500 })
    fireEvent.load(img)
    const viewBox = (selector) => container.querySelector(selector).getAttribute('viewBox').split(' ').map(Number)
    expect(viewBox('.display-blood')[3]).toBeCloseTo(166.67, 2)
    expect(viewBox('.display-chilli')[3]).toBeCloseTo(166.67, 2)

    fireEvent.error(img)
    expect(viewBox('.display-blood')).toEqual([0, 0, 100, 150])
  })

  it('steps with the arrow keys and pauses with Space, Enter and MediaPlayPause', async () => {
    serve(() => ok(books('Alpha', 'Beta', 'Gamma')))
    const { container, queryByText } = await mount()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(titleOf(container)).toBe('Beta')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(titleOf(container)).toBe('Gamma')
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true })
    expect(titleOf(container)).toBe('Gamma')

    fireEvent.keyDown(window, { key: ' ' })
    expect(queryByText('Paused')).not.toBeNull()
    await advance(60_000)
    expect(titleOf(container)).toBe('Gamma')
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(queryByText('Paused')).toBeNull()
    fireEvent.keyDown(window, { key: 'MediaPlayPause' })
    expect(queryByText('Paused')).not.toBeNull()
  })

  it('offers fullscreen only where the API exists, from the button or F', async () => {
    serve(() => ok(books('Alpha')))
    const first = await mount()
    expect(first.container.querySelector('.display-fullscreen')).toBeNull()
    first.unmount()

    document.fullscreenEnabled = true
    document.documentElement.requestFullscreen = vi.fn(async () => {})
    const { getByRole } = await mount()
    expect(getByRole('button').textContent).toBe('Full screen')
    fireEvent.keyDown(window, { key: 'f' })
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1)
    fireEvent.click(getByRole('button'))
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(2)
  })

  it('hides the cursor and the button after three seconds without pointer movement', async () => {
    serve(() => ok(books('Alpha')))
    const { container } = await mount()
    const root = container.querySelector('.display')
    expect(root.classList.contains('is-idle')).toBe(false)
    await advance(3000)
    expect(root.classList.contains('is-idle')).toBe(true)
    fireEvent.pointerMove(window)
    expect(root.classList.contains('is-idle')).toBe(false)
  })

  it('leaves no interval, timer, listener, wake lock or event stream behind after a StrictMode unmount', async () => {
    const { live } = stubEventSource()
    serve(() => ok(books('Alpha', 'Beta')))
    const sentinels = []
    navigator.wakeLock = {
      request: vi.fn(async () => {
        const sentinel = { released: false, addEventListener: vi.fn() }
        sentinel.release = vi.fn(async () => { sentinel.released = true })
        sentinels.push(sentinel)
        return sentinel
      }),
    }
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const spies = [window, document].map((target) => [
      vi.spyOn(target, 'addEventListener'),
      vi.spyOn(target, 'removeEventListener'),
    ])

    const { unmount } = await mount()
    unmount()
    await flush()

    const intervals = setIntervalSpy.mock.results.map((result) => result.value)
    expect(intervals.length).toBeGreaterThan(0)
    const cleared = clearIntervalSpy.mock.calls.map(([id]) => id)
    expect(intervals.filter((id) => !cleared.includes(id))).toEqual([])
    expect(vi.getTimerCount()).toBe(0)

    for (const [added, removed] of spies) {
      const live = added.mock.calls.filter(([type]) => OWN_EVENTS.includes(type))
      expect(live.length).toBeGreaterThan(0)
      for (const [type, listener] of removed.mock.calls) {
        const i = live.findIndex(([t, l]) => t === type && l === listener)
        if (i >= 0) live.splice(i, 1)
      }
      expect(live.map(([type]) => type)).toEqual([])
    }

    expect(sentinels.length).toBeGreaterThan(0)
    expect(sentinels.filter((sentinel) => !sentinel.released)).toEqual([])
    expect(live()).toEqual([])
  })
})
