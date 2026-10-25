/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from 'antd'
import Admin from '../src/pages/Admin/Admin.jsx'
import { checkSession, getSettings, signIn } from '../src/api/admin.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const empty = (status) => new Response(null, { status })
const NOT_SET = { is_set: false, source: null, hint: null }
const STATUSES = {
  google_books_api_key: { is_set: true, source: 'settings', hint: 'abcd' },
  anthropic_api_key: { is_set: true, source: 'env', hint: 'wxyz' },
  anthropic_model: NOT_SET,
  lookup_contact: NOT_SET,
}

// routes maps "METHOD /path" to a function of the parsed JSON body; anything else answers 404.
function fakeServer(routes) {
  const calls = []
  const fetch = vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ key, body })
    return routes[key] ? routes[key](body) : json({ error: 'Not found' }, 404)
  })
  vi.stubGlobal('fetch', fetch)
  return calls
}

const mount = () => render(<StrictMode><App><Admin /></App></StrictMode>)
const card = (title) => screen.getByText(title, { selector: '.ant-card-head-title' }).closest('.ant-card')

afterEach(() => vi.unstubAllGlobals())

describe('Admin page', () => {
  it('checks the session first, then asks for the password when signed out', async () => {
    let answer
    fakeServer({ 'GET /api/admin/session': () => new Promise((resolve) => (answer = resolve)) })
    mount()
    expect(document.querySelector('.admin-checking .ant-spin')).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
    answer(json({ error: 'Not signed in' }, 401))
    const password = await screen.findByLabelText('Password')
    expect(password.getAttribute('autocomplete')).toBe('current-password')
    expect(password.getAttribute('type')).toBe('password')
    expect(screen.getByText(/npm run admin:password/)).toBeTruthy()
  })

  it('shows a wrong password and the no-password message inline, as the server says them', async () => {
    let login = () => json({ error: 'Wrong password' }, 401)
    fakeServer({ 'GET /api/admin/session': () => json({ error: 'Not signed in' }, 401), 'POST /api/admin/login': () => login() })
    mount()
    fireEvent.change(await screen.findByLabelText('Password'), { target: { value: 'not it at all' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Wrong password')).toBeTruthy()
    login = () => json({ error: 'No admin password is set; run npm run admin:password on the server' }, 503)
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'another try' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('No admin password is set; run npm run admin:password on the server')).toBeTruthy()
  })

  it('signs in and shows each setting as a status, with empty key fields', async () => {
    const calls = fakeServer({
      'GET /api/admin/session': () => json({ error: 'Not signed in' }, 401),
      'POST /api/admin/login': () => empty(204),
      'GET /api/admin/settings': () => json(STATUSES),
    })
    mount()
    fireEvent.change(await screen.findByLabelText('Password'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const google = await waitFor(() => card('Google Books'))
    expect(within(google).getByText('Set, ends in …abcd')).toBeTruthy()
    expect(within(card('Claude')).getByText('From the environment')).toBeTruthy()
    expect(within(card('Claude')).getByText('Model: claude-opus-5-5, the default')).toBeTruthy()
    expect(within(card('Open Library contact')).getByText('Not set')).toBeTruthy()
    for (const input of within(google).getAllByPlaceholderText('Leave blank to keep')) expect(input.value).toBe('')
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
    expect(within(card('Claude')).getByLabelText('API key').getAttribute('placeholder')).toBe('Leave blank to keep')
    expect(calls.find(({ key }) => key === 'POST /api/admin/login').body).toEqual({ password: 'correct horse' })
  })

  it('saves a typed key, clears the field and shows the new status', async () => {
    const calls = fakeServer({
      'GET /api/admin/session': () => json({ admin: true }),
      'GET /api/admin/settings': () => json({ ...STATUSES, google_books_api_key: NOT_SET }),
      'PUT /api/admin/settings': () => json(STATUSES),
    })
    mount()
    const google = await waitFor(() => card('Google Books'))
    expect(within(google).getByText('Not set')).toBeTruthy()
    const field = within(google).getByPlaceholderText('Leave blank to keep')
    fireEvent.change(field, { target: { value: ' AIzaSyNew-key-abcd ' } })
    fireEvent.click(within(google).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(within(google).getByText('Set, ends in …abcd')).toBeTruthy())
    expect(calls.find(({ key }) => key === 'PUT /api/admin/settings').body).toEqual({ google_books_api_key: 'AIzaSyNew-key-abcd' })
    await waitFor(() => expect(within(card('Google Books')).getByPlaceholderText('Leave blank to keep').value).toBe(''))
  })

  it('saves a model from the list without touching the key', async () => {
    const calls = fakeServer({
      'GET /api/admin/session': () => json({ admin: true }),
      'GET /api/admin/settings': () => json(STATUSES),
      'PUT /api/admin/settings': () => json({ ...STATUSES, anthropic_model: { is_set: true, source: 'settings', hint: 'claude-haiku-5-5' } }),
    })
    mount()
    const claude = await waitFor(() => card('Claude'))
    fireEvent.mouseDown(within(claude).getByRole('combobox'))
    fireEvent.click(await screen.findByTitle('claude-haiku-5-5'))
    fireEvent.click(within(claude).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(within(claude).getByText('Model: claude-haiku-5-5')).toBeTruthy())
    expect(calls.find(({ key }) => key === 'PUT /api/admin/settings').body).toEqual({ anthropic_model: 'claude-haiku-5-5' })
  })

  it('shows what a test found, or the error it got', async () => {
    let test = () => json({ ok: true, latency_ms: 312, detail: '2 volumes for ISBN 9780553212587' })
    const calls = fakeServer({
      'GET /api/admin/session': () => json({ admin: true }),
      'GET /api/admin/settings': () => json(STATUSES),
      'POST /api/admin/settings/test': () => test(),
    })
    mount()
    const google = await waitFor(() => card('Google Books'))
    fireEvent.click(within(google).getByRole('button', { name: 'Test' }))
    expect(await within(google).findByText('Works: 2 volumes for ISBN 9780553212587 (312 ms)')).toBeTruthy()
    expect(calls.at(-1).body).toEqual({ service: 'google' })
    test = () => json({ error: 'Google Books answered HTTP 400: API key not valid: [redacted]' }, 502)
    // The loading icon of the first test can still be leaving, which adds "loading" to the name.
    fireEvent.click(within(google).getByRole('button', { name: /Test/ }))
    expect(await within(google).findByText('Google Books answered HTTP 400: API key not valid: [redacted]')).toBeTruthy()
  })

  it('goes back to the sign-in form when the session has ended', async () => {
    fakeServer({
      'GET /api/admin/session': () => json({ admin: true }),
      'GET /api/admin/settings': () => json(STATUSES),
      'POST /api/admin/settings/test': () => json({ error: 'Not signed in' }, 401),
    })
    mount()
    const google = await waitFor(() => card('Google Books'))
    fireEvent.click(within(google).getByRole('button', { name: 'Test' }))
    expect(await screen.findByLabelText('Password')).toBeTruthy()
    expect(await screen.findByText('The session has ended; sign in again')).toBeTruthy()
  })

  it('signs out', async () => {
    const calls = fakeServer({
      'GET /api/admin/session': () => json({ admin: true }),
      'GET /api/admin/settings': () => json(STATUSES),
      'POST /api/admin/logout': () => empty(204),
    })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByLabelText('Password')).toBeTruthy()
    expect(calls.some(({ key }) => key === 'POST /api/admin/logout')).toBe(true)
  })
})

describe('admin api', () => {
  it('reads a 401 session as signed out and rejects anything else', async () => {
    fakeServer({ 'GET /api/admin/session': () => json({ error: 'Not signed in' }, 401) })
    expect(await checkSession()).toBe(false)
    fakeServer({ 'GET /api/admin/session': () => json({ admin: true }) })
    expect(await checkSession()).toBe(true)
    fakeServer({ 'GET /api/admin/session': () => new Response('<html>502 Bad Gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }) })
    await expect(checkSession()).rejects.toMatchObject({ status: 502, message: 'The request failed (HTTP 502)' })
  })

  it("rejects with the server's message", async () => {
    fakeServer({ 'POST /api/admin/login': () => json({ error: 'Wrong password' }, 401), 'GET /api/admin/settings': () => json({ error: 'Not signed in' }, 401) })
    await expect(signIn('nope')).rejects.toMatchObject({ status: 401, message: 'Wrong password' })
    await expect(getSettings()).rejects.toMatchObject({ status: 401, message: 'Not signed in' })
  })
})
