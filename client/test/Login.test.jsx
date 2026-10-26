/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import Login, { nextPath } from '../src/pages/Login/Login.jsx'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function answerLogin(respond) {
  const calls = []
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined })
    return respond()
  }))
  return calls
}

const Landed = () => {
  const location = useLocation()
  return <p data-testid="landed">{`${location.pathname}${location.search}`}</p>
}

const mount = (entry) => render(
  <StrictMode>
    <App>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Landed />} />
        </Routes>
      </MemoryRouter>
    </App>
  </StrictMode>,
)

async function signIn(name, password) {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

afterEach(() => vi.unstubAllGlobals())

describe('Login page', () => {
  it('shows the wordmark and a name and password field the browser can fill', () => {
    answerLogin(() => json({ name: 'Ana' }))
    mount('/login')
    expect(screen.getByRole('heading', { name: 'Hemlock' })).toBeTruthy()
    expect(screen.getByLabelText('Name').getAttribute('autocomplete')).toBe('username')
    const password = screen.getByLabelText('Password')
    expect(password.getAttribute('autocomplete')).toBe('current-password')
    expect(password.getAttribute('type')).toBe('password')
  })

  it('asks for both fields before it sends anything', async () => {
    const calls = answerLogin(() => json({ name: 'Ana' }))
    mount('/login')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter your name')).toBeTruthy()
    expect(screen.getByText('Enter the password')).toBeTruthy()
    expect(calls).toEqual([])
  })

  it('signs in with the trimmed name and goes to the page the visitor wanted', async () => {
    const calls = answerLogin(() => json({ name: 'Ana' }))
    mount('/login?next=%2Flibrary%3Fwishlist%3D1')
    await signIn('  ana ', 'correct horse')
    expect((await screen.findByTestId('landed')).textContent).toBe('/library?wishlist=1')
    expect(calls).toEqual([{ url: '/api/login', method: 'POST', body: { name: 'ana', password: 'correct horse' } }])
  })

  it('goes to the library without a next, or with one that leaves the site', async () => {
    for (const entry of ['/login', '/login?next=%2F%2Fevil.example%2F', '/login?next=https%3A%2F%2Fevil.example%2Flibrary']) {
      answerLogin(() => json({ name: 'Ana' }))
      const { unmount } = mount(entry)
      await signIn('Ana', 'correct horse')
      expect((await screen.findByTestId('landed')).textContent, entry).toBe('/library')
      unmount()
    }
  })

  it('shows the 401, 429 and 503 inline as the server words them, and clears them on typing', async () => {
    let answer = () => json({ error: 'Wrong name or password' }, 401)
    answerLogin(() => answer())
    mount('/login?next=%2Fauthors')
    await signIn('Ana', 'wrong password')
    expect(await screen.findByText('Wrong name or password')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'another try' } })
    await waitFor(() => expect(screen.queryByText('Wrong name or password')).toBeNull())

    for (const [status, error] of [
      [429, 'Too many wrong passwords; try again in 15 minutes'],
      [503, 'No user exists yet; run npm run user:add on the server'],
    ]) {
      answer = () => json({ error }, status)
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
      expect(await screen.findByText(error)).toBeTruthy()
    }
    expect(screen.queryByTestId('landed')).toBeNull()
  })
})

describe('nextPath', () => {
  const origin = 'https://hemlock.example'

  it('keeps a path on this site with its query and hash', () => {
    expect(nextPath('/library?wishlist=1#top', origin)).toBe('/library?wishlist=1#top')
    expect(nextPath('/display', origin)).toBe('/display')
  })

  it('answers the library for anything else', () => {
    for (const raw of [null, '', 'library', '//evil.example/x', '/\\evil.example', 'https://evil.example/', 'javascript:alert(1)', '/login', '/login?next=/login']) {
      expect(nextPath(raw, origin), String(raw)).toBe('/library')
    }
  })
})
