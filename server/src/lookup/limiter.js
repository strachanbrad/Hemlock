/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Starts each task at least `interval` ms (a number, or a function read at each start) after the
// previous one started, in call order. A task's own failure never holds the queue: the queue waits
// only on the spacing.
export function createLimiter({ interval, now, sleep }) {
  const spacing = typeof interval === 'function' ? interval : () => interval
  let nextStart = -Infinity
  let queue = Promise.resolve()

  return function schedule(task) {
    const turn = queue.then(async () => {
      const wait = nextStart - now()
      if (wait > 0) await sleep(wait)
      nextStart = now() + spacing()
    })
    queue = turn
    return turn.then(task)
  }
}
