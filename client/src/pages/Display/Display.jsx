/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useCallback, useEffect, useState } from 'react'
import { fetchDisplayBooks } from '../../api/display.js'
import config from '../../config/config.json'
import { Umbel } from '../../images/ornaments/index.js'
import CoverEffects from './CoverEffects.jsx'
import { BOX_HEIGHT, faceHeight } from './effects.js'
import { applyBooks, createShow, currentIndex, readOptions, step, togglePause } from './slideshow.js'
import './display.css'

const TICK_MS = 500
const REFRESH_MS = 5 * 60 * 1000
const RETRY_MS = 30 * 1000
const IDLE_MS = 3000
const RELOAD_MS = 24 * 60 * 60 * 1000

const FORMATS = { hardcover: 'Hardcover', paperback: 'Paperback', ebook: 'Ebook' }
const SEPARATOR = ' · '

const fullscreenAvailable = () =>
  document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === 'function'

function toggleFullscreen() {
  const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
  request?.catch(() => {})
}

const clampRating = (value) => Math.min(5, Math.max(0, value))

function metaLine(book, ratings) {
  const stars = clampRating(book.star_rating)
  const parts = [FORMATS[book.format], stars ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : null]
  if (ratings) {
    if (book.spice_rating) parts.push(`Spice ${clampRating(book.spice_rating)}/5`)
    if (book.gore_rating) parts.push(`Gore ${clampRating(book.gore_rating)}/5`)
  }
  return parts.filter(Boolean).join(SEPARATOR)
}

function nextView(view, books, index, paused) {
  if (view.books === books && view.index === index && view.paused === paused) return view
  const shown = view.books[view.index] ?? null
  const moved = (books[index]?.id ?? null) !== (shown?.id ?? null)
  return { books, index, paused, previous: moved ? shown : view.previous }
}

// The previous slide fades out and the next one preloads its cover. Slides render in list order so a
// slide changing role is never moved in the DOM, which would cancel its opacity transition.
function slidesOf({ books, index, previous }) {
  if (index < 0) return []
  const slides = new Map()
  const add = (book, position) => {
    if (book && !slides.has(book.id)) slides.set(book.id, { book, position })
  }
  add(books[index], index)
  add(books[(index + 1) % books.length], (index + 1) % books.length)
  if (previous) {
    const position = books.findIndex((book) => book.id === previous.id)
    add(position >= 0 ? books[position] : previous, position)
  }
  return [...slides.values()].sort((a, b) => a.position - b.position)
}

function Slide({ book, current, ratings, effects }) {
  const [failedUrl, setFailedUrl] = useState(null)
  const [loaded, setLoaded] = useState(null)
  const missing = !book.cover_url || failedUrl === book.cover_url
  const face = missing ? BOX_HEIGHT : loaded?.url === book.cover_url ? loaded.height : null
  const meta = metaLine(book, ratings)
  const onLoad = (event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget
    setLoaded({ url: book.cover_url, height: faceHeight(naturalWidth, naturalHeight) })
  }

  return (
    <section className={current ? 'display-slide is-current' : 'display-slide'} aria-hidden={current ? undefined : true}>
      <div className={missing ? 'display-cover is-missing' : 'display-cover'}>
        {book.cover_url && <img src={book.cover_url} alt="" onLoad={onLoad} onError={() => setFailedUrl(book.cover_url)} />}
        <div className="display-cover-fallback">
          <span className="display-cover-title">{book.title}</span>
          <Umbel className="display-cover-umbel" aria-hidden="true" />
        </div>
        {effects && face !== null && (
          <CoverEffects id={book.id} gore={book.gore_rating} spice={book.spice_rating} height={face} />
        )}
      </div>
      <div className="display-text">
        <h1 className="display-title">{book.title}</h1>
        {book.author && <p className="display-author">{book.author}</p>}
        {meta && <p className="display-meta">{meta}</p>}
        {book.synopsis && <p className="display-synopsis">{book.synopsis}</p>}
      </div>
    </section>
  )
}

export default function Display() {
  const [options] = useState(() => readOptions(window.location.search))
  const [show] = useState(() => createShow(options.seconds * 1000, Date.now()))
  const [view, setView] = useState({ books: [], index: -1, paused: false, previous: null })
  const [status, setStatus] = useState('loading')
  const [idle, setIdle] = useState(false)
  const [canFullscreen] = useState(fullscreenAvailable)
  const [fullscreen, setFullscreen] = useState(() => document.fullscreenElement != null)

  const present = useCallback((t) => {
    const index = currentIndex(show, t)
    const { books } = show
    const paused = show.pausedAt != null
    setView((previous) => nextView(previous, books, index, paused))
  }, [show])

  useEffect(() => {
    const loadedAt = Date.now()
    const tick = () => {
      const t = Date.now()
      if (t - loadedAt >= RELOAD_MS) window.location.reload()
      else present(t)
    }
    const timer = setInterval(tick, TICK_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [present])

  useEffect(() => {
    const controller = new AbortController()
    let timer
    const load = async () => {
      try {
        const books = await fetchDisplayBooks(options.filter, { signal: controller.signal })
        if (controller.signal.aborted) return
        const t = Date.now()
        applyBooks(show, books, t)
        present(t)
        setStatus('ready')
        timer = setTimeout(load, REFRESH_MS)
      } catch {
        if (controller.signal.aborted) return
        setStatus((current) => (current === 'ready' ? current : 'failed'))
        timer = setTimeout(load, RETRY_MS)
      }
    }
    load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [options.filter, show, present])

  useEffect(() => {
    const onKey = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const t = Date.now()
      switch (event.key) {
        case 'ArrowRight':
          step(show, t, 1)
          break
        case 'ArrowLeft':
          step(show, t, -1)
          break
        case ' ':
        case 'Enter':
          // A focused button keeps its own activation keys.
          if (event.target instanceof HTMLButtonElement) return
          togglePause(show, t)
          break
        case 'MediaPlayPause':
          togglePause(show, t)
          break
        case 'f':
        case 'F':
          if (!canFullscreen) return
          toggleFullscreen()
          break
        default:
          return
      }
      event.preventDefault()
      present(t)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show, present, canFullscreen])

  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), IDLE_MS)
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdle(true), IDLE_MS)
    }
    window.addEventListener('pointermove', wake)
    window.addEventListener('pointerdown', wake)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
    }
  }, [])

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement != null)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  useEffect(() => {
    if (!navigator.wakeLock) return
    let lock = null
    let pending = false
    let stopped = false
    const acquire = () => {
      if (stopped || lock || pending || document.visibilityState !== 'visible') return
      pending = true
      navigator.wakeLock.request('screen').then((sentinel) => {
        pending = false
        if (stopped) {
          sentinel.release().catch(() => {})
          return
        }
        lock = sentinel
        // The browser releases the lock when the page is hidden; visibilitychange requests a new one.
        sentinel.addEventListener('release', () => {
          if (lock === sentinel) lock = null
        })
      }, () => {
        pending = false
      })
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', acquire)
      lock?.release().catch(() => {})
      lock = null
    }
  }, [])

  const currentId = view.index >= 0 ? view.books[view.index].id : null
  const message = status === 'failed'
    ? 'Cannot reach the library. Retrying.'
    : status === 'ready' && view.books.length === 0 ? 'No books to show.' : null

  return (
    <div className={idle ? 'display is-idle' : 'display'}>
      <div className="display-stage">
        {slidesOf(view).map(({ book }) => (
          <Slide key={book.id} book={book} current={book.id === currentId} ratings={options.ratings} effects={options.effects} />
        ))}
        {message && <p className="display-message">{message}</p>}
        {view.paused && <p className="display-paused">Paused</p>}
        <p className="display-caption">
          <Umbel className="display-caption-umbel" aria-hidden="true" />
          {config.website.title}
        </p>
      </div>
      {canFullscreen && (
        <button
          type="button"
          className="display-fullscreen"
          onClick={(event) => {
            toggleFullscreen()
            event.currentTarget.blur()
          }}
        >
          {fullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
      )}
    </div>
  )
}
