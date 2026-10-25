/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { errorMessage } from './request.js'

export const fetchBooks = async (setBooks, bookType) => {
  try {
    const response = await fetch(`/api/${bookType}/get/`)
    if (response.ok) {
      const data = await response.json()
      setBooks((data.data || []).map((book) => ({ ...book, type: bookType })))
    } else {
      console.error(`Failed to fetch books of type ${bookType}:`, response.statusText)
      setBooks([])
    }
  } catch (error) {
    console.error(`Network error when fetching books of type ${bookType}:`, error)
    setBooks([])
  }
}

export const fetchBooksByAuthor = async (authors, setBooks, bookType) => {
  const booksByAuthor = await Promise.all(authors.map(async (author) => {
    try {
      const response = await fetch(`/api/${bookType}/author/${author.author_id}`)
      if (!response.ok) {
        console.error(`Failed to fetch books for author ${author.author_id}:`, response.statusText)
        return { [author.author_id]: [] }
      }
      const data = await response.json()
      return { [author.author_id]: (data.data || []).map((book) => ({ ...book, type: bookType })) }
    } catch (error) {
      console.error(`Network error when fetching books for author ${author.author_id}:`, error)
      return { [author.author_id]: [] }
    }
  }))

  setBooks(booksByAuthor.reduce((acc, current) => ({ ...acc, ...current }), {}))
}

const bookForm = (fields, fileMetadata) => {
  const formData = new FormData()
  if (fileMetadata && fileMetadata.originFileObj instanceof File) {
    formData.append('cover', fileMetadata.originFileObj)
  }
  Object.keys(fields).forEach((key) => {
    formData.append(key, fields[key])
  })
  return formData
}

export const updateBookDetail = async (isbn, updates, bookType, fileMetadata = null) => {
  try {
    const response = await fetch(`/api/${bookType}/${encodeURIComponent(isbn)}/update`, {
      method: 'POST',
      body: bookForm(updates, fileMetadata),
    })
    if (!response.ok) throw new Error(await errorMessage(response, 'Failed to update the book'))
    return await response.json()
  } catch (error) {
    console.error('Error updating book detail:', error)
    throw error
  }
}

export const insertBookDetail = async (isbn, newBookData, bookType, fileMetadata = null) => {
  const response = await fetch(`/api/${bookType}/${encodeURIComponent(isbn)}/insert`, {
    method: 'POST',
    body: bookForm(newBookData, fileMetadata),
  })
  if (!response.ok) throw new Error(await errorMessage(response, 'Failed to add the book'))
  return response.json()
}

export const convertEBookToBook = async (ebookData) => {
  try {
    const response = await fetch('/api/convertEBookToBook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ebookData),
    })
    if (!response.ok) throw new Error(await errorMessage(response, 'Failed to convert EBook to Book'))
    return await response.json()
  } catch (error) {
    console.error('Error during eBook conversion:', error)
    throw error
  }
}
