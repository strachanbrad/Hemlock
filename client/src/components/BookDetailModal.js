/*BookDetailModal.js
 *
 * Copyright (c) 2023 Hemlock
 * Author: Bradly Strachan
 * 
 * This file is part of Hemlock, which is released under the GNU General Public License v3.0.
 * See the file LICENSE in this distribution for more information.
 */

import React from 'react';
import { Modal, Button, Form, Popconfirm, message, Space } from 'antd';
import { useBookDetail } from './BookDetailContext';
import config from '../config/config.json';
import { deleteData } from '../js/api'
import BookDetailEdit from './BookDetailEdit';
import BookDetailReadonly from './BookDetailReadonly';

const BookDetailModal = (props) => {
  const { isOpen, isEditable, bookRecord, hideBookDetailModal, toggleEdit } = useBookDetail();
  const [form] = Form.useForm()

  const onCancel = () => {
    hideBookDetailModal();
  };

  const onConfirm = () => {
    form.submit();
    toggleEdit();
  }

  const onDelete = () => {
    try{
      deleteData(bookRecord.type, bookRecord.isbn);
      message.success(`${bookRecord.title} successfully removed`)
    } catch(error){
      message.error(error.message)
    } finally{
      hideBookDetailModal()
    }
  }

  const headerStyle = {
    verticalAlign: 'center',
    textAlign: 'center',
    color: config.website.theme.textBase,
    borderRadius: config.website.theme.borderRadius,
    marginBottom: 25,
  };

  const siderStyle = {
    textAlign: 'center',
    backgroundColor: '#f5f5f5',
    marginBottom: 25,
  };

  return (
    <Modal
      title={isEditable ? 'Edit Book Details' : 'Book Details'}
      open={isOpen}
      onCancel={onCancel}
      key='bookdetailmodal'
      footer={[
        isEditable ? (
          <Space key='footerSpace'>
            <Popconfirm
              key="delete"
              title={`Are you sure you want to delete ${bookRecord.title}?`}
              onConfirm={onDelete}
            >
              <Button key="deleteBtn" danger ghost style={{align: 'left'}}>
                Delete
              </Button>
            </Popconfirm>

            <Popconfirm
              key="save"
              title="Are you sure you want to save these changes?"
              onConfirm={onConfirm}
            >
              <Button key="saveBtn" type='primary' style={{align: 'right'}}>
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
  );
};

export default BookDetailModal;
