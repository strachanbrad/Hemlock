/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Button, Upload } from 'antd'
import { PictureOutlined } from '@ant-design/icons'

export const COVER_TYPES = 'image/jpeg,image/png,image/webp'

// Holds the chosen file for a form (controlled by Form: value is a File or null); nothing uploads until the form saves.
export const CoverPicker = ({ value, onChange, label = 'Choose a cover' }) => (
  <Upload
    accept={COVER_TYPES}
    listType="picture"
    maxCount={1}
    fileList={value ? [{ uid: 'cover', name: value.name, status: 'done', originFileObj: value }] : []}
    beforeUpload={(file) => {
      onChange?.(file)
      return Upload.LIST_IGNORE
    }}
    onRemove={() => onChange?.(null)}
  >
    <Button icon={<PictureOutlined aria-hidden="true" />}>{label}</Button>
  </Upload>
)

// Picks a file and hands it straight to onFile, which saves it.
export const ChangeCoverButton = ({ onFile, busy, label = 'Change cover', size = 'small' }) => (
  <Upload
    accept={COVER_TYPES}
    showUploadList={false}
    beforeUpload={(file) => {
      onFile(file)
      return Upload.LIST_IGNORE
    }}
  >
    <Button size={size} loading={busy}>{label}</Button>
  </Upload>
)
