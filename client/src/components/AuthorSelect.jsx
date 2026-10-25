/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useEffect, useMemo, useState } from 'react'
import { App, Select } from 'antd'
import { listAuthors } from '../api/authors.js'
import { authorFromValue, authorOptions, valueOfAuthor } from '../lib/authors.js'

// Controlled by Form: value is { id, name } for an existing author or { name } for a new one.
const AuthorSelect = ({ id, value, onChange, status }) => {
  const { message } = App.useApp()
  const [authors, setAuthors] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    listAuthors({ signal: controller.signal })
      .then(setAuthors)
      .catch((err) => {
        if (!controller.signal.aborted) message.error(`Could not load the authors: ${err.message}`)
      })
    return () => controller.abort()
  }, [message])

  const options = useMemo(() => {
    const found = authorOptions(authors, search)
    const selected = valueOfAuthor(value)
    if (value && !value.id && !found.some((option) => option.value === selected)) {
      found.push({ value: selected, label: `${value.name} (new author)` })
    }
    return found
  }, [authors, search, value])

  return (
    <Select
      id={id}
      status={status}
      value={valueOfAuthor(value)}
      options={options}
      placeholder="Choose an author or type a new name"
      showSearch={{ searchValue: search, onSearch: setSearch, filterOption: false }}
      notFoundContent={search ? null : 'No authors yet: type a name'}
      onChange={(selected) => {
        setSearch('')
        onChange?.(authorFromValue(selected, authors))
      }}
    />
  )
}

export default AuthorSelect
