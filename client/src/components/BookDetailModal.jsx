/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { App, Modal, Button, Form, Popconfirm, Space } from 'antd'
import { useBookDetail } from './BookDetailContext.jsx'
import config from '../config/config.json'
import { deleteData } from '../api/data.js'
import BookDetailEdit from './BookDetailEdit.jsx'
import BookDetailReadonly from './BookDetailReadonly.jsx'

const BookDetailModal = (props) => {
  const { message } = App.useApp()
  const { isOpen, isEditable, bookRecord, hideBookDetailModal, toggleEdit } = useBookDetail()
  const [form] = Form.useForm()

  const onConfirm = () => {
    form.submit()
    toggleEdit()
  }

  const onDelete = async () => {
    try {
      await deleteData(bookRecord.type, bookRecord.isbn)
      message.success(`${bookRecord.title} successfully removed`)
    } catch (error) {
      message.error(error.message)
    } finally {
      hideBookDetailModal()
    }
  }

  const headerStyle = {
    verticalAlign: 'center',
    textAlign: 'center',
    color: config.website.theme.textBase,
    borderRadius: config.website.theme.borderRadius,
    marginBottom: 25,
  }

  const siderStyle = {
    textAlign: 'center',
    backgroundColor: '#f5f5f5',
    marginBottom: 25,
  }

  return (
    <Modal
      title={isEditable ? 'Edit Book Details' : 'Book Details'}
      open={isOpen}
      onCancel={hideBookDetailModal}
      key="bookdetailmodal"
      footer={[
        isEditable ? (
          <Space key="footerSpace">
            <Popconfirm
              key="delete"
              title={`Are you sure you want to delete ${bookRecord.title}?`}
              onConfirm={onDelete}
            >
              <Button key="deleteBtn" danger ghost style={{ align: 'left' }}>
                Delete
              </Button>
            </Popconfirm>

            <Popconfirm
              key="save"
              title="Are you sure you want to save these changes?"
              onConfirm={onConfirm}
            >
              <Button key="saveBtn" type="primary" style={{ align: 'right' }}>
                Save Changes
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          <Button key="editBtn" onClick={toggleEdit}>
            Edit
          </Button>
        ),
      ]}
      {...props}
    >
      {isEditable ? (
        <BookDetailEdit {...{ headerStyle, siderStyle, form }} />
      ) : (
        <BookDetailReadonly {...{ headerStyle, siderStyle }} />
      )}
    </Modal>
  )
}

export default BookDetailModal
