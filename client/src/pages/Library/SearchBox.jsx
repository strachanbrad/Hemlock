/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useEffect, useState } from 'react'
import { Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'

const DEBOUNCE_MS = 250

// Holds the typed text and reports it 250 ms after the last keystroke; a change of
// `value` from outside (Clear filters) replaces the text. The router applies a reported
// text in a transition, so keystrokes can land first: a value this box sent keeps them.
const SearchBox = ({ value, onChange, className }) => {
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)
  const [sent, setSent] = useState([])
  if (value !== shown) {
    setShown(value)
    const at = sent.indexOf(value)
    setSent(at >= 0 ? sent.slice(at + 1) : [])
    if (at < 0) setText(value)
  }

  useEffect(() => {
    if (text === value) return undefined
    const timer = setTimeout(() => {
      setSent((prev) => [...prev, text])
      onChange(text)
    }, DEBOUNCE_MS)
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
