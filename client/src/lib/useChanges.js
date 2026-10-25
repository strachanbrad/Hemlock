/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useEffect, useRef, useState } from 'react'
import { liveUpdatesSupported, watchChanges } from '../api/events.js'

export const COALESCE_MS = 300

// Calls the latest callback once per burst of events: the first opens a 300 ms window that the rest
// join. Answers whether this browser has live updates; a page polls only when it has not.
export function useChanges(callback) {
  const latest = useRef(callback)
  const [supported] = useState(liveUpdatesSupported)

  useEffect(() => {
    latest.current = callback
  })

  useEffect(() => {
    let timer = null
    const close = watchChanges(() => {
      timer ??= setTimeout(() => {
        timer = null
        latest.current()
      }, COALESCE_MS)
    })
    return () => {
      close()
      clearTimeout(timer)
    }
  }, [])

  return supported
}
