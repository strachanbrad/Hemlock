/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App as AntApp } from 'antd'
import { MemoryRouter, useLocation } from 'react-router'
import App from '../src/App.jsx'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const SIGN_IN = () => json({ error: 'Sign in' }, 401)

// routes maps "METHOD /path" to a function answering a Response; anything else answers an empty list.
function fakeServer(routes) {
  const calls = []
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    calls.push(key)
    return routes[key] ? routes[key]() : json([])
  }))
  return calls
}

const Landed = () => {
  const { pathname, search } = useLocation()
  return <output data-testid="landed">{`${pathname}${search}`}</output>
}

const mount = (entry) => render(
  <StrictMode>
    <AntApp>
      <MemoryRouter initialEntries={[entry]}>
        <App />
        <Landed />
      </MemoryRouter>
    </AntApp>
  </StrictMode>,
)

const landed = () => screen.getByTestId('landed').textContent

afterEach(() => vi.unstubAllGlobals())

describe('the shell', () => {
  it('shows nothing while it checks the session, then sends a signed-out visitor to the login page with next', async () => {
    let answer
    const calls = fakeServer({ 'GET /api/session': () => new Promise((resolve) => (answer = resolve)) })
    mount('/authors?q=x')
    expect(document.querySelector('.shell')).toBeNull()
    answer(SIGN_IN())
    await waitFor(() => expect(landed()).toBe('/login?next=%2Fauthors%3Fq%3Dx'))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(calls.filter((key) => key !== 'GET /api/session')).toEqual([])
  })

  it('shows the pages and Sign out with the name in the sider once signed in, and signs out to the login page', async () => {
    const calls = fakeServer({ 'GET /api/session': () => json({ name: 'Ana' }), 'POST /api/logout': () => new Response(null, { status: 204 }) })
    mount('/authors')
    const sider = await waitFor(() => {
      const found = document.querySelector('.shell-sider')
      expect(found).toBeTruthy()
      return found
    })
    expect(within(sider).getByText('Ana')).toBeTruthy()
    fireEvent.click(within(sider).getByText('Sign out'))
    await waitFor(() => expect(landed()).toBe('/login'))
    expect(calls).toContain('POST /api/logout')
  })

  it('puts Sign out in the phone tab bar', async () => {
    vi.stubGlobal('matchMedia', (query) => ({ media: query, matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    const calls = fakeServer({ 'GET /api/session': () => json({ name: 'Ana' }), 'POST /api/logout': () => new Response(null, { status: 204 }) })
    mount('/library')
    const bar = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(bar).getAllByRole('link').map((link) => link.textContent)).toEqual(['Library', 'Wishlist', 'Add', 'Authors'])
    fireEvent.click(within(bar).getByRole('button', { name: /Sign out/ }))
    await waitFor(() => expect(landed()).toBe('/login'))
    expect(calls).toContain('POST /api/logout')
  })

  it('sends the visitor to the login page once when a later request answers 401, and checks no more', async () => {
    const calls = fakeServer({ 'GET /api/session': () => json({ name: 'Ana' }), 'GET /api/authors': SIGN_IN })
    mount('/authors')
    await waitFor(() => expect(landed()).toBe('/login?next=%2Fauthors'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(landed()).toBe('/login?next=%2Fauthors')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    // StrictMode runs the mount effects twice, so the one load asks twice.
    expect(calls.filter((key) => key === 'GET /api/session').length).toBeLessThanOrEqual(2)
    expect(calls.filter((key) => key === 'GET /api/authors').length).toBeLessThanOrEqual(2)
  })

  it('keeps the shell when the server cannot be reached, so the page can say so', async () => {
    fakeServer({ 'GET /api/session': () => new Response('<html>502 Bad Gateway</html>', { status: 502 }) })
    mount('/authors')
    await waitFor(() => expect(document.querySelector('.shell-sider')).toBeTruthy())
    expect(landed()).toBe('/authors')
  })
})
