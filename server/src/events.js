/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

const DEFAULT_WAIT = 25
const MAX_WAIT = 30

// Says only that something changed: no ids, no titles, nothing a page could not fetch. `secondMs`
// is how long a second of a long poll's `wait` lasts; tests shorten it.
export function createEvents({ pingMs = 25000, maxClients = 50, secondMs = 1000 } = {}) {
  const clients = new Set()
  const holds = new Set()
  let timer = null
  let version = Date.now()

  const full = () => clients.size + holds.size >= maxClients
  const refuse = (res) => res.status(503).json({ error: 'Too many open pages' })
  const send = (text) => {
    for (const res of clients) res.write(text)
  }

  function handler(req, res) {
    if (full()) return refuse(res)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()
    res.write('retry: 5000\n\n')
    clients.add(res)
    // One interval for every client; the pings keep proxies' read timeouts from firing and make a
    // write to a dead connection fail, which closes it.
    if (!timer) timer = setInterval(() => send(': ping\n\n'), pingMs).unref()
    res.on('close', () => {
      clients.delete(res)
      if (clients.size === 0) {
        clearInterval(timer)
        timer = null
      }
    })
  }

  const answer = (hold) => {
    clearTimeout(hold.timer)
    holds.delete(hold)
    hold.res.json({ version })
  }

  // The long poll, for a client that cannot hold a stream: answers at once when `since` is not the
  // current version, otherwise at the next publish or after `wait` seconds, whichever comes first.
  function changes(req, res) {
    res.set('Cache-Control', 'no-store')
    if (Number(req.query.since) !== version) return res.json({ version })
    if (full()) return refuse(res)
    const raw = req.query.wait
    const asked = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
    const wait = Number.isFinite(asked) ? Math.min(MAX_WAIT, asked) : DEFAULT_WAIT
    const hold = { res }
    hold.timer = setTimeout(() => answer(hold), wait * secondMs)
    holds.add(hold)
    res.on('close', () => {
      clearTimeout(hold.timer)
      holds.delete(hold)
    })
  }

  function publish(kind) {
    version += 1
    send(`event: changed\ndata: ${JSON.stringify({ kind })}\n\n`)
    for (const hold of [...holds]) answer(hold)
  }

  return { handler, changes, publish, size: () => clients.size + holds.size }
}
