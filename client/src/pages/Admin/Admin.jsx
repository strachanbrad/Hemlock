/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useEffect, useState } from 'react'
import { Alert, App, Button, Card, Form, Input, Popconfirm, Select, Spin } from 'antd'
import { checkSession, getSettings, saveSettings, signIn, signOut, testService } from '../../api/admin.js'
import { PageHeading } from '../../components/Headings.jsx'
import './admin.css'

export const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']
const DEFAULT_MODEL = MODELS[0]
const OTHER = 'other'
const MODEL_OPTIONS = [...MODELS.map((model) => ({ value: model, label: model })), { value: OTHER, label: 'Another model…' }]

export function keyStatus(status) {
  if (status.source === 'settings') return `Set, ends in …${status.hint}`
  if (status.source === 'env') return 'From the environment'
  return 'Not set'
}

function plainStatus(status, unset) {
  if (status.source === 'settings') return `Set: ${status.hint}`
  if (status.source === 'env') return `From the environment: ${status.hint}`
  return unset
}

async function loadAdmin(signal) {
  if (!(await checkSession({ signal }))) return null
  return getSettings({ signal })
}

const TestResult = ({ result }) =>
  result ? <p className={result.ok ? 'admin-test admin-test-ok' : 'admin-test admin-test-error'} role="status">{result.text}</p> : null

// The key field is write-only: a saved key never comes back from the server, so the field starts empty.
const KeyCard = ({ title, help, service, status, busy, result, onSave, onClear, onTest, children }) => {
  const [form] = Form.useForm()
  const save = async ({ key }) => {
    if (await onSave(key?.trim() ?? '')) form.resetFields()
  }
  return (
    <Card title={title} className="admin-card">
      <p className="admin-help reading">{help}</p>
      <p className="admin-status">{keyStatus(status)}</p>
      <Form form={form} name={service} layout="vertical" onFinish={save} initialValues={{ key: '' }} requiredMark={false}>
        <Form.Item name="key" label="API key">
          <Input.Password placeholder="Leave blank to keep" autoComplete="new-password" spellCheck={false} />
        </Form.Item>
        {children}
        <div className="admin-actions">
          <Button type="primary" htmlType="submit" loading={busy === `${service}:save`}>Save</Button>
          {status.source === 'settings' && (
            <Popconfirm title="Clear the saved key?" okText="Clear" okType="danger" onConfirm={onClear}>
              <Button danger loading={busy === `${service}:clear`}>Clear</Button>
            </Popconfirm>
          )}
          <Button onClick={onTest} loading={busy === `${service}:test`} disabled={!status.is_set}>Test</Button>
        </div>
      </Form>
      <TestResult result={result} />
    </Card>
  )
}

const ModelField = ({ value, onChange }) => (
  <div className="admin-model">
    <Form.Item label="Model" htmlFor="admin-model">
      <Select id="admin-model" value={value.choice} options={MODEL_OPTIONS} onChange={(choice) => onChange({ ...value, choice })} />
    </Form.Item>
    {value.choice === OTHER && (
      <Form.Item label="Model id" htmlFor="admin-model-other">
        <Input id="admin-model-other" value={value.other} placeholder="claude-…" spellCheck={false} onChange={(event) => onChange({ ...value, other: event.target.value })} />
      </Form.Item>
    )}
  </div>
)

const modelChoice = (saved) => (!saved || MODELS.includes(saved) ? { choice: saved ?? DEFAULT_MODEL, other: '' } : { choice: OTHER, other: saved })

const Settings = ({ statuses, onChange, onSignedOut }) => {
  const { message } = App.useApp()
  const [busy, setBusy] = useState(null)
  const [results, setResults] = useState({})
  const savedModel = statuses.anthropic_model.is_set ? statuses.anthropic_model.hint : null
  const [model, setModel] = useState(() => modelChoice(savedModel))
  const [contactForm] = Form.useForm()

  const act = async (id, run) => {
    setBusy(id)
    try {
      return await run()
    } catch (err) {
      if (err.status === 401) onSignedOut({ expired: true })
      else message.error(err.message)
      return false
    } finally {
      setBusy(null)
    }
  }

  const save = (id, changes, done) => act(id, async () => {
    if (Object.keys(changes).length === 0) {
      message.info('Nothing to save')
      return false
    }
    const next = await saveSettings(changes)
    onChange(next)
    if (Object.hasOwn(changes, 'anthropic_model')) setModel(modelChoice(next.anthropic_model.is_set ? next.anthropic_model.hint : null))
    message.success(done)
    return true
  })

  const test = (service) => act(`${service}:test`, async () => {
    setResults((current) => ({ ...current, [service]: null }))
    try {
      const { latency_ms: ms, detail } = await testService(service)
      setResults((current) => ({ ...current, [service]: { ok: true, text: `Works: ${detail} (${ms} ms)` } }))
    } catch (err) {
      if (err.status === 401) throw err
      setResults((current) => ({ ...current, [service]: { ok: false, text: err.message } }))
    }
    return true
  })

  const claudeChanges = (key) => {
    const changes = key ? { anthropic_api_key: key } : {}
    const chosen = model.choice === OTHER ? model.other.trim() : model.choice
    if (chosen && chosen !== (savedModel ?? DEFAULT_MODEL)) changes.anthropic_model = chosen === DEFAULT_MODEL ? null : chosen
    return changes
  }

  const saveContact = async ({ contact }) => {
    const text = contact?.trim() ?? ''
    if (await save('contact:save', text ? { lookup_contact: text } : {}, 'Saved the contact address')) contactForm.resetFields()
  }

  const leave = () => act('signout', async () => {
    await signOut()
    onSignedOut({ expired: false })
    return true
  })

  return (
    <>
      <div className="admin-cards">
        <KeyCard
          title="Google Books"
          help="With a key, a lookup asks Google Books as well as Open Library. Create it in the Google Cloud console with the Books API enabled."
          service="google"
          status={statuses.google_books_api_key}
          busy={busy}
          result={results.google}
          onSave={(key) => save('google:save', key ? { google_books_api_key: key } : {}, 'Saved the Google Books key')}
          onClear={() => save('google:clear', { google_books_api_key: null }, 'Cleared the Google Books key')}
          onTest={() => test('google')}
        />
        <KeyCard
          title="Claude"
          help="With a key, a book no catalogue knows is looked up by Claude with web search, from the listing that shows its ISBN."
          service="anthropic"
          status={statuses.anthropic_api_key}
          busy={busy}
          result={results.anthropic}
          onSave={(key) => save('anthropic:save', claudeChanges(key), 'Saved the Claude settings')}
          onClear={() => save('anthropic:clear', { anthropic_api_key: null }, 'Cleared the Claude key')}
          onTest={() => test('anthropic')}
        >
          <p className="admin-status">{savedModel ? `Model: ${savedModel}` : `Model: ${DEFAULT_MODEL}, the default`}</p>
          <ModelField value={model} onChange={setModel} />
        </KeyCard>
        <Card title="Open Library contact" className="admin-card">
          <p className="admin-help reading">An email address in Open Library&rsquo;s User-Agent raises its limit from one request a second to three.</p>
          <p className="admin-status">{plainStatus(statuses.lookup_contact, 'Not set')}</p>
          <Form form={contactForm} name="lookup" layout="vertical" onFinish={saveContact} initialValues={{ contact: '' }} requiredMark={false}>
            <Form.Item name="contact" label="Email address">
              <Input type="email" inputMode="email" autoComplete="email" placeholder="you@example.org" />
            </Form.Item>
            <div className="admin-actions">
              <Button type="primary" htmlType="submit" loading={busy === 'contact:save'}>Save</Button>
              {statuses.lookup_contact.source === 'settings' && (
                <Popconfirm title="Clear the saved address?" okText="Clear" okType="danger" onConfirm={() => save('contact:clear', { lookup_contact: null }, 'Cleared the contact address')}>
                  <Button danger loading={busy === 'contact:clear'}>Clear</Button>
                </Popconfirm>
              )}
            </div>
          </Form>
        </Card>
      </div>
      <div className="admin-session">
        <p className="admin-help reading">
          The admin password is set on the server with <code>npm run admin:password</code>; setting it again signs every device out.
        </p>
        <Button onClick={leave} loading={busy === 'signout'}>Sign out</Button>
      </div>
    </>
  )
}

const SignIn = ({ onSignedIn }) => {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async ({ password }) => {
    setBusy(true)
    setError(null)
    try {
      await signIn(password)
      await onSignedIn()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Card className="admin-card admin-signin">
      <Form name="admin" layout="vertical" onFinish={submit} onValuesChange={() => setError(null)} requiredMark={false}>
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: 'Enter the password' }]}
          validateStatus={error ? 'error' : undefined}
          help={error ?? undefined}
        >
          <Input.Password autoComplete="current-password" autoFocus />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy} block>Sign in</Button>
      </Form>
      <p className="admin-help reading">The password is set on the server with <code>npm run admin:password</code>.</p>
    </Card>
  )
}

const Admin = () => {
  const { message } = App.useApp()
  const [statuses, setStatuses] = useState(undefined)
  const [failure, setFailure] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    loadAdmin(controller.signal).then(
      (loaded) => controller.signal.aborted || setStatuses(loaded),
      (err) => controller.signal.aborted || setFailure(err.message),
    )
    return () => controller.abort()
  }, [])

  const signedIn = async () => setStatuses(await getSettings())
  const signedOut = ({ expired }) => {
    setStatuses(null)
    if (expired) message.warning('The session has ended; sign in again')
  }

  let body
  if (failure) body = <Alert type="error" showIcon title={failure} />
  else if (statuses === undefined) body = <div className="admin-checking"><Spin /></div>
  else if (statuses === null) body = <SignIn onSignedIn={signedIn} />
  else body = <Settings statuses={statuses} onChange={setStatuses} onSignedOut={signedOut} />

  return (
    <section className="admin">
      <PageHeading>Admin</PageHeading>
      {body}
    </section>
  )
}

export default Admin
