/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useState } from 'react'
import { App, Select, Button, Input, Space, Popconfirm, Typography } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { insertData } from '../api/data.js'

const AuthorSelector = ({ authors, currentAuthorId, onAuthorChange, onNewAuthor, variant }) => {
  const { message } = App.useApp()
  const [isAddingNewAuthor, setIsAddingNewAuthor] = useState(false)
  const [newAuthorFirstName, setNewAuthorFirstName] = useState('')
  const [newAuthorLastName, setNewAuthorLastName] = useState('')
  const [errors, setErrors] = useState({ firstName: '', lastName: '' })
  const [searchTerm, setSearchTerm] = useState('')

  const lowercasedFilter = searchTerm.toLowerCase()
  const filteredAuthors = authors.filter(({ first_name, last_name }) =>
    first_name.toLowerCase().includes(lowercasedFilter) || last_name.toLowerCase().includes(lowercasedFilter)
  )

  const validateFields = () => {
    let isValid = true
    const errors = {}

    if (!newAuthorFirstName.trim()) {
      errors.firstName = 'First name is required'
      isValid = false
    }

    if (!newAuthorLastName.trim()) {
      errors.lastName = 'Last name is required'
      isValid = false
    }

    setErrors(errors)
    return isValid
  }

  const handleAddNewAuthor = () => {
    if (!validateFields()) {
      return
    }

    const newAuthorId = authors.length > 0 ? authors[authors.length - 1].author_id + 1 : 1
    const newAuthor = {
      author_id: newAuthorId,
      first_name: newAuthorFirstName,
      last_name: newAuthorLastName,
    }

    insertData('Authors', newAuthor)
      .then(() => message.success(`${newAuthor.first_name} ${newAuthor.last_name} successfully added`))
      .catch((error) => message.error(`Error inserting new author: ${error.message}`))

    onNewAuthor(newAuthor)

    setNewAuthorFirstName('')
    setNewAuthorLastName('')
    setIsAddingNewAuthor(false)
  }

  return (
    <div>
      {!isAddingNewAuthor ? (
        <Select
          value={currentAuthorId}
          onChange={onAuthorChange}
          placeholder="Author"
          allowClear={true}
          variant={variant}
          size="large"
          options={filteredAuthors.map((author) => ({
            value: author.author_id,
            label: `${author.first_name} ${author.last_name}`,
          }))}
          popupRender={(menu) => (
            <>
              <Input
                placeholder="Search by first or last name"
                allowClear={true}
                prefix={<SearchOutlined />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {menu}
              <Button type="dashed" onClick={() => setIsAddingNewAuthor(true)} block>
                Add New Author
              </Button>
            </>
          )}
        />
      ) : (
        <Space>
          <Space.Compact>
            <Space.Compact orientation="vertical">
              <Input
                placeholder="First Name"
                value={newAuthorFirstName}
                onChange={(e) => {
                  setNewAuthorFirstName(e.target.value)
                  setErrors((errors) => ({ ...errors, firstName: '' }))
                }}
                status={errors.firstName ? 'error' : ''}
              />
              {errors.firstName && <Typography.Text type="danger">{errors.firstName}</Typography.Text>}
            </Space.Compact>
            <Space.Compact orientation="vertical">
              <Input
                placeholder="Last Name"
                value={newAuthorLastName}
                onChange={(e) => {
                  setNewAuthorLastName(e.target.value)
                  setErrors((errors) => ({ ...errors, lastName: '' }))
                }}
                status={errors.lastName ? 'error' : ''}
              />
              {errors.lastName && <Typography.Text type="danger">{errors.lastName}</Typography.Text>}
            </Space.Compact>
          </Space.Compact>
          <Popconfirm
            title="Create new Author"
            description={`Are you sure you want to add ${newAuthorFirstName} ${newAuthorLastName}?`}
            onConfirm={handleAddNewAuthor}
          >
            <Button type="primary">Add Author</Button>
          </Popconfirm>
          <Button onClick={() => setIsAddingNewAuthor(false)}>Cancel</Button>
        </Space>
      )}
    </div>
  )
}

export default AuthorSelector
