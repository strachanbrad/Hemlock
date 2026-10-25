/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { Segmented, Spin } from 'antd'
import { PicCenterOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Link } from 'react-router'
import BookCover from '../../components/BookCover.jsx'
import FormatTags from '../../components/FormatTags.jsx'
import { BookmarkFilled } from '../../images/index.js'
import {
  DRAG_THRESHOLD, WHEEL_START, centreIndex, coverPose, dragPosition, flowGeometry, keyTarget, poseTransform,
  releaseTarget, stepIndex, storeView, storedView, visibleRange, wheelDelta, wheelStep,
} from './coverflow.js'
import '../../styles/coverflow.css'

const IDLE_MS = 100

// An address without `view` shows the view this browser chose last.
export function useLibraryView(addressView, changeFilters) {
  const [saved, setSaved] = useState(storedView)
  const change = (view) => {
    storeView(view)
    setSaved(view)
    changeFilters({ view: view === 'flow' ? 'flow' : null })
  }
  return [addressView ?? saved, change]
}

export const ViewToggle = ({ view, onChange, compact = false }) => {
  const label = (text) => <span className={compact ? 'visually-hidden' : undefined}>{text}</span>
  return (
    <Segmented
      className="view-toggle"
      aria-label="View"
      value={view}
      onChange={onChange}
      options={[
        { value: 'list', icon: <UnorderedListOutlined aria-hidden="true" />, label: label('List'), title: 'List' },
        { value: 'flow', icon: <PicCenterOutlined aria-hidden="true" />, label: label('Flow'), title: 'Flow' },
      ]}
    />
  )
}

const CoverFlow = ({ books, loading = false, linkTo, onOpen }) => {
  const rootRef = useRef(null)
  const stageRef = useRef(null)
  const drag = useRef(null)
  const wheel = useRef(WHEEL_START)
  const swallowClick = useRef(false)
  const frame = useRef(0)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [centre, setCentre] = useState({ id: null, index: 0 })
  const [dragPos, setDragPos] = useState(null)

  const g = flowGeometry(size.width, size.height)
  const count = books.length
  const index = centreIndex(books, centre)
  const book = books[index]
  const position = dragPos ?? index
  const [from, to] = visibleRange(position, g.side, count)

  const moveTo = (target) => {
    if (count > 0) setCentre({ id: books[target].id, index: target })
  }

  useLayoutEffect(() => {
    const root = rootRef.current
    const measure = () => {
      const next = { width: root.clientWidth, height: window.innerHeight }
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const onWheel = useEffectEvent((event) => {
    event.preventDefault()
    if (drag.current?.moved) return
    const { state, step } = wheelStep(wheel.current, wheelDelta(event), event.timeStamp)
    wheel.current = state
    if (step !== 0) moveTo(stepIndex(index, step, count))
  })

  // React's own wheel listener is passive, so it cannot keep the page from scrolling.
  useEffect(() => {
    const stage = stageRef.current
    const listener = (event) => onWheel(event)
    stage.addEventListener('wheel', listener, { passive: false })
    return () => stage.removeEventListener('wheel', listener)
  }, [])

  useEffect(() => {
    const pending = frame
    return () => cancelAnimationFrame(pending.current)
  }, [])

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && book) {
      event.preventDefault()
      onOpen(book.id)
      return
    }
    const target = keyTarget(event.key, index, count)
    if (target === null) return
    event.preventDefault()
    moveTo(target)
  }

  const onPointerDown = (event) => {
    swallowClick.current = false
    if (event.button !== 0 || count === 0) return
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startIndex: index, x: event.clientX, t: event.timeStamp, velocity: 0, position: index, moved: false }
  }

  const onPointerMove = (event) => {
    const d = drag.current
    if (!d || event.pointerId !== d.pointerId) return
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      drag.current = null
      return
    }
    const dx = event.clientX - d.startX
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return
      d.moved = true
      // Capture starts only with a drag, so a click still lands on the cover under the pointer.
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    const dt = event.timeStamp - d.t
    if (dt > 0) d.velocity = 0.6 * d.velocity + 0.4 * (-(event.clientX - d.x) / g.step / dt)
    d.x = event.clientX
    d.t = event.timeStamp
    d.position = dragPosition(d.startIndex, dx, g.step, count)
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => setDragPos(d.position))
  }

  const endDrag = (event, fling) => {
    const d = drag.current
    if (!d || event.pointerId !== d.pointerId) return
    drag.current = null
    if (!d.moved) return
    swallowClick.current = true
    cancelAnimationFrame(frame.current)
    const velocity = fling && event.timeStamp - d.t < IDLE_MS ? d.velocity : 0
    moveTo(releaseTarget(d.position, velocity, count))
    setDragPos(null)
  }

  const onClickCapture = (event) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    event.stopPropagation()
  }

  const covers = books.slice(from, to + 1).map((item, k) => {
    const i = from + k
    const pose = coverPose(i - position, g)
    return (
      <div
        key={item.id}
        className={pose.opacity === 0 ? 'coverflow-cover is-hidden' : 'coverflow-cover'}
        style={{ transform: poseTransform(pose), zIndex: pose.zIndex, '--cover-opacity': pose.opacity }}
        aria-hidden={i === index ? undefined : true}
        onClick={() => (i === index ? onOpen(item.id) : moveTo(i))}
      >
        <BookCover url={item.cover_url} title={item.title} size="flow" />
        <div className="coverflow-reflection" aria-hidden="true">
          <BookCover url={item.cover_url} title={item.title} size="flow" />
        </div>
      </div>
    )
  })

  return (
    <Spin spinning={loading}>
      <div className="coverflow" ref={rootRef} style={{ '--cover-w': `${g.cover}px`, '--flow-perspective': `${Math.round(g.perspective)}px` }}>
        <div
          ref={stageRef}
          className={dragPos === null ? 'coverflow-stage' : 'coverflow-stage is-dragging'}
          tabIndex={0}
          role="group"
          aria-roledescription="carousel"
          aria-label="Cover flow"
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => endDrag(event, true)}
          onPointerCancel={(event) => endDrag(event, false)}
          onClickCapture={onClickCapture}
        >
          {covers}
        </div>
        <div className="coverflow-caption" aria-live="polite">
          {book && (
            <>
              <Link className="coverflow-title" to={linkTo(book.id)} state={{ fromList: true }}>{book.title}</Link>
              <span className="coverflow-author">{book.author.name}</span>
              <span className="coverflow-tags">
                <FormatTags book={book} />
                {book.wishlist && <span className="coverflow-wishlist"><BookmarkFilled aria-hidden="true" />On the wishlist</span>}
              </span>
              <span className="coverflow-position">{index + 1} of {count}</span>
            </>
          )}
        </div>
      </div>
    </Spin>
  )
}

export default CoverFlow
