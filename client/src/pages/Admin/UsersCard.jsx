/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useState } from 'react'
import { Alert, Button, Card, Form, Input, Popconfirm, Spin } from 'antd'
import { addUser, listUsers, removeUser, setUserPassword } from '../../api/admin.js'
import { localDateTime } from '../../lib/dates.js'
import { useAdminList } from './useAdminList.js'

const MIN_PASSWORD = 8
const MAX_NAME = 64
const PASSWORD_RULES = [{ required: true, message: 'Enter a password' }, { min: MIN_PASSWORD, message: `At least ${MIN_PASSWORD} characters` }]
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id
// The server names the field first in a 400, and a taken name in a 409.
const fieldOf = (err) => (/^password/.test(err.message) ? 'password' : 'name')

const PasswordForm = ({ user, busy, onSave, onCancel }) => {
  const [form] = Form.useForm()
  return (
    <Form form={form} name={`password-${user.id}`} layout="vertical" className="admin-inline" onFinish={({ password }) => onSave(password, form)} requiredMark={false}>
      <Form.Item name="password" label={`New password for ${user.name}`} rules={PASSWORD_RULES}>
        <Input.Password autoComplete="new-password" autoFocus />
      </Form.Item>
      <div className="admin-actions">
        <Button type="primary" htmlType="submit" loading={busy}>Save password</Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </Form>
  )
}

const UsersCard = ({ onSignedOut }) => {
  const { list: users, setList: setUsers, failure, busy, act, message } = useAdminList(listUsers, onSignedOut)
  const [editing, setEditing] = useState(null)
  const [addForm] = Form.useForm()

  const add = ({ name, password }) => act('add', async () => {
    const user = await addUser(name.trim(), password)
    setUsers((current) => [...current, user].sort(byName))
    addForm.resetFields()
    message.success(`Added ${user.name}`)
  }, (err) => addForm.setFields([{ name: fieldOf(err), errors: [err.message] }]))

  const savePassword = (user) => (password, form) => act(`password:${user.id}`, async () => {
    await setUserPassword(user.id, password)
    setEditing(null)
    message.success(`Set the password for ${user.name}, who is signed out everywhere`)
  }, (err) => form.setFields([{ name: 'password', errors: [err.message] }]))

  const remove = (user) => act(`remove:${user.id}`, async () => {
    await removeUser(user.id)
    setUsers((current) => current.filter(({ id }) => id !== user.id))
    message.success(`Removed ${user.name}`)
  })

  let list
  if (failure) list = <Alert type="error" showIcon title={failure} />
  else if (!users) list = <div className="admin-checking"><Spin /></div>
  else if (users.length === 0) list = <p className="admin-status">No users yet</p>
  else {
    list = (
      <ul className="admin-list" aria-label="Users">
        {users.map((user) => (
          <li key={user.id} className="admin-row">
            <div className="admin-row-main">
              <div className="admin-row-text">
                <span className="admin-row-name">{user.name}</span>
                <span className="admin-row-meta">{user.last_login_at ? `Last signed in ${localDateTime(user.last_login_at)}` : 'Never signed in'}</span>
              </div>
              <div className="admin-actions">
                <Button size="small" onClick={() => setEditing(editing === user.id ? null : user.id)}>Set password</Button>
                <Popconfirm title={`Remove ${user.name}?`} description="They are signed out everywhere." okText="Remove" okType="danger" onConfirm={() => remove(user)}>
                  <Button size="small" danger loading={busy === `remove:${user.id}`}>Remove</Button>
                </Popconfirm>
              </div>
            </div>
            {editing === user.id && (
              <PasswordForm user={user} busy={busy === `password:${user.id}`} onSave={savePassword(user)} onCancel={() => setEditing(null)} />
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Card title="Users" className="admin-card">
      <p className="admin-help reading">
        Everyone signed in sees and edits the whole library. The admin password is not a user; the first user is added on the server with <code>npm run user:add</code>.
      </p>
      {list}
      <Form form={addForm} name="add-user" layout="vertical" className="admin-add" onFinish={add} requiredMark={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter a name' }, { max: MAX_NAME, message: `At most ${MAX_NAME} characters` }]}>
          <Input autoComplete="off" autoCapitalize="none" spellCheck={false} />
        </Form.Item>
        <Form.Item name="password" label="Password" rules={PASSWORD_RULES}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <div className="admin-actions">
          <Button type="primary" htmlType="submit" loading={busy === 'add'}>Add user</Button>
        </div>
      </Form>
    </Card>
  )
}

export default UsersCard
