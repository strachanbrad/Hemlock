/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { vi } from 'vitest'

// jsdom has no EventSource. Each stubbed source is recorded; the test drives it by hand.
export function stubEventSource() {
  const sources = []
  class FakeEventSource {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 2

    constructor(url) {
      this.url = url
      this.readyState = FakeEventSource.CONNECTING
      this.listeners = {}
      this.closed = false
      sources.push(this)
    }

    addEventListener(type, listener) {
      ;(this.listeners[type] ??= []).push(listener)
    }

    close() {
      this.readyState = FakeEventSource.CLOSED
      this.closed = true
    }

    emit(type, readyState) {
      if (type === 'open') this.readyState = FakeEventSource.OPEN
      if (readyState !== undefined) this.readyState = readyState
      for (const listener of this.listeners[type] ?? []) listener(new Event(type))
    }
  }
  vi.stubGlobal('EventSource', FakeEventSource)
  const live = () => sources.filter((source) => !source.closed)
  return { sources, live, latest: () => live().at(-1), FakeEventSource }
}
