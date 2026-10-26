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
import { localDateTime } from '../src/lib/dates.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const empty = (status) => new Response(null, { status })
const NOT_SET = { is_set: false, source: null, hint: null }
const STATUSES = {
  google_books_api_key: { is_set: true, source: 'settings', hint: 'abcd' },
  anthropic_api_key: { is_set: true, source: 'env', hint: 'wxyz' },
  anthropic_model: NOT_SET,
  lookup_contact: NOT_SET,
}

// routes maps "METHOD /path" to a function of the parsed JSON body; the user and TV lists are empty
// unless routes says otherwise, and anything else answers 404.
function fakeServer(given) {
  const routes = { 'GET /api/admin/users': () => json([]), 'GET /api/admin/devices': () => json([]), ...given }
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
    // A button still loading ignores a click, and its leaving icon adds "loading" to the name.
    const again = within(google).getByRole('button', { name: /Test/ })
    await waitFor(() => expect(again.classList.contains('ant-btn-loading')).toBe(false))
    fireEvent.click(again)
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
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out of admin' }))
    expect(await screen.findByLabelText('Password')).toBeTruthy()
    expect(calls.some(({ key }) => key === 'POST /api/admin/logout')).toBe(true)
  })
})

const ANA = { id: 1, name: 'Ana', created_at: '2026-10-01T10:00:00.000Z', last_login_at: '2026-10-25T09:05:00.000Z' }
const BO = { id: 2, name: 'Bo', created_at: '2026-10-02T10:00:00.000Z', last_login_at: null }
const LOUNGE = { id: 7, name: 'Lounge', created_at: '2026-10-20T18:00:00.000Z', last_seen_at: '2026-10-25T20:00:00.000Z' }

const signedIn = (routes) => fakeServer({
  'GET /api/admin/session': () => json({ admin: true }),
  'GET /api/admin/settings': () => json(STATUSES),
  'GET /api/admin/users': () => json([ANA, BO]),
  'GET /api/admin/devices': () => json([LOUNGE]),
  ...routes,
})

async function confirm(button) {
  fireEvent.click(button)
  const popup = await waitFor(() => {
    const found = document.querySelector('.ant-popconfirm')
    expect(found).toBeTruthy()
    return found
  })
  fireEvent.click(within(popup).getByRole('button', { name: 'Remove' }))
}

const row = (scope, name) => within(scope).getByText(name, { selector: '.admin-row-name' }).closest('.admin-row')

describe('the Users card', () => {
  it('lists each user with their last sign-in', async () => {
    signedIn({})
    mount()
    const users = await waitFor(() => card('Users'))
    expect(await within(users).findByText(`Last signed in ${localDateTime(ANA.last_login_at)}`)).toBeTruthy()
    expect(within(row(users, 'Bo')).getByText('Never signed in')).toBeTruthy()
    expect(within(users).getByText(/npm run user:add/)).toBeTruthy()
  })

  it('adds a user with the trimmed name, and shows a name taken under the name field', async () => {
    let add = () => json({ id: 3, name: 'Cy', created_at: '2026-10-25T12:00:00.000Z', last_login_at: null }, 201)
    const calls = signedIn({ 'POST /api/admin/users': () => add() })
    mount()
    const users = await waitFor(() => card('Users'))
    await within(users).findByText('Bo')
    fireEvent.change(within(users).getByLabelText('Name'), { target: { value: '  Cy ' } })
    fireEvent.change(within(users).getByLabelText('Password'), { target: { value: 'a long password' } })
    fireEvent.click(within(users).getByRole('button', { name: 'Add user' }))
    expect(await within(users).findByText('Cy', { selector: '.admin-row-name' })).toBeTruthy()
    expect(calls.find(({ key }) => key === 'POST /api/admin/users').body).toEqual({ name: 'Cy', password: 'a long password' })
    expect(within(users).getByLabelText('Name').value).toBe('')

    add = () => json({ error: 'The name ana is taken' }, 409)
    fireEvent.change(within(users).getByLabelText('Name'), { target: { value: 'ana' } })
    fireEvent.change(within(users).getByLabelText('Password'), { target: { value: 'a long password' } })
    fireEvent.click(within(users).getByRole('button', { name: 'Add user' }))
    expect(await within(users).findByText('The name ana is taken')).toBeTruthy()
  })

  it('refuses a password under 8 characters before it sends anything', async () => {
    const calls = signedIn({})
    mount()
    const users = await waitFor(() => card('Users'))
    fireEvent.change(within(users).getByLabelText('Name'), { target: { value: 'Cy' } })
    fireEvent.change(within(users).getByLabelText('Password'), { target: { value: 'seven77' } })
    fireEvent.click(within(users).getByRole('button', { name: 'Add user' }))
    expect(await within(users).findByText('At least 8 characters')).toBeTruthy()
    expect(calls.some(({ key }) => key === 'POST /api/admin/users')).toBe(false)
  })

  it('sets a password for one user', async () => {
    const calls = signedIn({ 'PUT /api/admin/users/2/password': () => empty(204) })
    mount()
    const users = await waitFor(() => card('Users'))
    await within(users).findByText('Bo')
    fireEvent.click(within(row(users, 'Bo')).getByRole('button', { name: 'Set password' }))
    fireEvent.change(within(users).getByLabelText('New password for Bo'), { target: { value: 'a new password' } })
    fireEvent.click(within(row(users, 'Bo')).getByRole('button', { name: 'Save password' }))
    await waitFor(() => expect(within(users).queryByLabelText('New password for Bo')).toBeNull())
    expect(calls.find(({ key }) => key === 'PUT /api/admin/users/2/password').body).toEqual({ password: 'a new password' })
  })

  it('removes a user after the confirmation', async () => {
    const calls = signedIn({ 'DELETE /api/admin/users/1': () => empty(204) })
    mount()
    const users = await waitFor(() => card('Users'))
    await within(users).findByText('Ana')
    await confirm(within(row(users, 'Ana')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(within(users).queryByText('Ana', { selector: '.admin-row-name' })).toBeNull())
    expect(calls.some(({ key }) => key === 'DELETE /api/admin/users/1')).toBe(true)
  })

  it('goes back to the sign-in form when the admin session has ended', async () => {
    signedIn({ 'GET /api/admin/users': () => json({ error: 'Not signed in' }, 401) })
    mount()
    expect(await screen.findByLabelText('Password')).toBeTruthy()
    expect(await screen.findByText('The session has ended; sign in again')).toBeTruthy()
  })
})

describe('the Televisions card', () => {
  it('says how to pair, and lists each TV with when it was paired and last seen', async () => {
    signedIn({ 'GET /api/admin/devices': () => json([LOUNGE, { ...LOUNGE, id: 8, name: 'Kitchen', last_seen_at: null }]) })
    mount()
    const tvs = await waitFor(() => card('Televisions'))
    expect(within(tvs).getByText('To pair a TV, open Hemlock on it and type the code it shows.')).toBeTruthy()
    expect(await within(tvs).findByText(`Paired ${localDateTime(LOUNGE.created_at)}, last seen ${localDateTime(LOUNGE.last_seen_at)}`)).toBeTruthy()
    expect(within(row(tvs, 'Kitchen')).getByText(/not seen yet/)).toBeTruthy()
  })

  it('pairs the code a TV shows, spaces ignored, and adds it to the list', async () => {
    const calls = signedIn({
      'GET /api/admin/devices': () => json([]),
      'POST /api/admin/devices': () => json({ id: 9, name: 'Bedroom', created_at: '2026-10-25T21:00:00.000Z' }, 201),
    })
    mount()
    const tvs = await waitFor(() => card('Televisions'))
    fireEvent.change(within(tvs).getByLabelText('Code'), { target: { value: ' 048 213 ' } })
    fireEvent.change(within(tvs).getByLabelText('Name'), { target: { value: ' Bedroom ' } })
    fireEvent.click(within(tvs).getByRole('button', { name: 'Pair' }))
    expect(await within(tvs).findByText('Bedroom', { selector: '.admin-row-name' })).toBeTruthy()
    expect(calls.find(({ key }) => key === 'POST /api/admin/devices').body).toEqual({ code: '048213', name: 'Bedroom' })
    expect(within(row(tvs, 'Bedroom')).getByText(/not seen yet/)).toBeTruthy()
  })

  it('refuses anything but six digits, and shows a code no TV shows under the code field', async () => {
    const calls = signedIn({ 'POST /api/admin/devices': () => json({ error: 'No television is showing that code' }, 404) })
    mount()
    const tvs = await waitFor(() => card('Televisions'))
    fireEvent.change(within(tvs).getByLabelText('Code'), { target: { value: '12345' } })
    fireEvent.change(within(tvs).getByLabelText('Name'), { target: { value: 'Den' } })
    fireEvent.click(within(tvs).getByRole('button', { name: 'Pair' }))
    expect(await within(tvs).findByText('Type the six digits the TV shows')).toBeTruthy()
    expect(calls.some(({ key }) => key === 'POST /api/admin/devices')).toBe(false)

    fireEvent.change(within(tvs).getByLabelText('Code'), { target: { value: '123456' } })
    fireEvent.click(within(tvs).getByRole('button', { name: 'Pair' }))
    expect(await within(tvs).findByText('No television is showing that code')).toBeTruthy()
  })

  it('removes a TV after the confirmation', async () => {
    const calls = signedIn({ 'DELETE /api/admin/devices/7': () => empty(204) })
    mount()
    const tvs = await waitFor(() => card('Televisions'))
    await within(tvs).findByText('Lounge')
    await confirm(within(row(tvs, 'Lounge')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(within(tvs).queryByText('Lounge', { selector: '.admin-row-name' })).toBeNull())
    expect(calls.some(({ key }) => key === 'DELETE /api/admin/devices/7')).toBe(true)
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
