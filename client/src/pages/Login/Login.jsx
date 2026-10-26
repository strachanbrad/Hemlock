/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useState } from 'react'
import { Button, Card, Form, Input } from 'antd'
import { useNavigate, useSearchParams } from 'react-router'
import { login } from '../../api/session.js'
import config from '../../config/config.json'
import { Rule } from '../../images/ornaments/index.js'
import './login.css'

const HOME = '/library'

// Only a path on this site, so a crafted link cannot send a fresh sign-in to another one. The URL
// parser reads //host and /\host as another host, which the origin check refuses.
export function nextPath(raw, origin = window.location.origin) {
  if (!raw) return HOME
  try {
    const url = new URL(raw, origin)
    if (url.origin !== origin || url.pathname === '/login') return HOME
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return HOME
  }
}

const Login = () => {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async ({ name, password }) => {
    setBusy(true)
    setError(null)
    try {
      await login(name.trim(), password)
      navigate(nextPath(params.get('next')), { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <Card className="login-card">
        <header className="login-brand">
          <img src={config.logo} alt="" className="login-logo" />
          <h1 className="login-title">{config.website.title}</h1>
          <Rule className="login-rule" aria-hidden="true" />
        </header>
        <Form name="login" layout="vertical" onFinish={submit} onValuesChange={() => setError(null)} requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter your name' }]}>
            <Input autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: 'Enter the password' }]}
            validateStatus={error ? 'error' : undefined}
            help={error ?? undefined}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy} block>Sign in</Button>
        </Form>
      </Card>
    </main>
  )
}

export default Login
