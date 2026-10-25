/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useEffect, useState } from 'react'
import { Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'

const DEBOUNCE_MS = 250

// Holds the typed text and reports it 250 ms after the last keystroke; a change of
// `value` from outside (Clear filters) replaces the text.
const SearchBox = ({ value, onChange, className }) => {
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    setText(value)
  }

  useEffect(() => {
    if (text === value) return undefined
    const timer = setTimeout(() => onChange(text), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, value, onChange])

  return (
    <Input
      className={className}
      type="search"
      allowClear
      prefix={<SearchOutlined aria-hidden="true" />}
      placeholder="Search title, author or ISBN"
      aria-label="Search title, author or ISBN"
      value={text}
      onChange={(event) => setText(event.target.value)}
    />
  )
}

export default SearchBox
