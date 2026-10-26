/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Alert, Button, Card, Form, Input, Popconfirm, Spin } from 'antd'
import { listDevices, pairDevice, removeDevice } from '../../api/admin.js'
import { localDateTime } from '../../lib/dates.js'
import { useAdminList } from './useAdminList.js'

const MAX_NAME = 64
const digits = (value) => (value ?? '').replace(/\s/g, '')
const codeRule = {
  validator: (_, value) => (/^\d{6}$/.test(digits(value)) ? Promise.resolve() : Promise.reject(new Error('Type the six digits the TV shows'))),
}
const seen = (device) => (device.last_seen_at ? `last seen ${localDateTime(device.last_seen_at)}` : 'not seen yet')

const TelevisionsCard = ({ onSignedOut }) => {
  const { list: devices, setList: setDevices, failure, busy, act, message } = useAdminList(listDevices, onSignedOut)
  const [form] = Form.useForm()

  const pair = ({ code, name }) => act('pair', async () => {
    const device = await pairDevice(digits(code), name.trim())
    setDevices((current) => [...current, { ...device, last_seen_at: null }])
    form.resetFields()
    message.success(`Paired ${device.name}`)
  }, (err) => form.setFields([{ name: /^name/.test(err.message) ? 'name' : 'code', errors: [err.message] }]))

  const remove = (device) => act(`remove:${device.id}`, async () => {
    await removeDevice(device.id)
    setDevices((current) => current.filter(({ id }) => id !== device.id))
    message.success(`Removed ${device.name}`)
  })

  let list = null
  if (failure) list = <Alert type="error" showIcon title={failure} />
  else if (!devices) list = <div className="admin-checking"><Spin /></div>
  else if (devices.length > 0) {
    list = (
      <ul className="admin-list admin-list-after" aria-label="Paired televisions">
        {devices.map((device) => (
          <li key={device.id} className="admin-row">
            <div className="admin-row-main">
              <div className="admin-row-text">
                <span className="admin-row-name">{device.name}</span>
                <span className="admin-row-meta">Paired {localDateTime(device.created_at)}, {seen(device)}</span>
              </div>
              <div className="admin-actions">
                <Popconfirm title={`Remove ${device.name}?`} description="It shows a new code to pair again." okText="Remove" okType="danger" onConfirm={() => remove(device)}>
                  <Button size="small" danger loading={busy === `remove:${device.id}`}>Remove</Button>
                </Popconfirm>
              </div>
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Card title="Televisions" className="admin-card">
      <p className="admin-help reading">To pair a TV, open Hemlock on it and type the code it shows.</p>
      <Form form={form} name="pair-tv" layout="vertical" onFinish={pair} requiredMark={false}>
        <Form.Item name="code" label="Code" rules={[codeRule]}>
          <Input inputMode="numeric" autoComplete="off" placeholder="123 456" maxLength={12} />
        </Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Name the TV' }, { max: MAX_NAME, message: `At most ${MAX_NAME} characters` }]}>
          <Input autoComplete="off" placeholder="Living room" />
        </Form.Item>
        <div className="admin-actions">
          <Button type="primary" htmlType="submit" loading={busy === 'pair'}>Pair</Button>
        </div>
      </Form>
      {list}
    </Card>
  )
}

export default TelevisionsCard
