/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useCallback, useEffect, useState } from 'react'
import { App } from 'antd'
import { getBook, listBooks, updateBook } from '../../api/books.js'
import { createFieldSaves } from '../../lib/fieldSaves.js'

// The list for one filter query and the open book. Writes replace a book by id from
// the response; a rating or read change shows at once and reverts if the save fails.
export function useLibrary(query, openId) {
  const { message } = App.useApp()
  const [list, setList] = useState({ query: null, books: [], error: null })
  const [detail, setDetail] = useState({ id: null, book: null, error: null })
  const [saves] = useState(createFieldSaves)

  useEffect(() => {
    const controller = new AbortController()
    listBooks(query, { signal: controller.signal })
      .then((books) => setList({ query, books, error: null }))
      .catch((err) => {
        if (!controller.signal.aborted) setList({ query, books: [], error: err.message })
      })
    return () => controller.abort()
  }, [query])

  useEffect(() => {
    if (!openId) return undefined
    const controller = new AbortController()
    getBook(openId, { signal: controller.signal })
      .then((book) => setDetail({ id: openId, book, error: null }))
      .catch((err) => {
        if (!controller.signal.aborted) setDetail({ id: openId, book: null, error: err.message })
      })
    return () => controller.abort()
  }, [openId])

  const apply = useCallback((changes) => {
    const merge = (book) => (book.id === changes.id ? { ...book, ...changes } : book)
    setList((prev) => ({ ...prev, books: prev.books.map(merge) }))
    setDetail((prev) => (prev.book ? { ...prev, book: merge(prev.book) } : prev))
  }, [])

  const remove = useCallback((id) => {
    setList((prev) => ({ ...prev, books: prev.books.filter((book) => book.id !== id) }))
  }, [])

  const save = useCallback(async (book, fields) => {
    const settle = saves.start(book, fields)
    apply({ id: book.id, ...fields })
    let saved = null
    let error = null
    try {
      saved = await updateBook(book.id, fields)
    } catch (err) {
      error = err
    }
    const { show, failed } = settle(saved)
    if (Object.keys(show).length > 0) apply({ id: book.id, ...show })
    if (failed) message.error(`Not saved: ${error.message}`)
  }, [apply, message, saves])

  const placeholder = list.books.find((book) => String(book.id) === openId) ?? null
  const fetched = detail.id === openId ? detail : null

  return {
    books: list.books,
    loading: list.query !== query,
    error: list.query === query ? list.error : null,
    openBook: fetched?.book ?? placeholder,
    openBookLoaded: Boolean(fetched?.book),
    openError: fetched?.error ?? null,
    apply,
    remove,
    save,
  }
}
