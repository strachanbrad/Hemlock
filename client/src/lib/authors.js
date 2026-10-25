/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

export const collapse = (text) => text.trim().replace(/\s+/g, ' ')

const sameName = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase()

// Select values: `id:<author id>` for an existing author, `new:<name>` for one the save creates.
export function authorOptions(authors, search) {
  const typed = collapse(search)
  const needle = typed.toLocaleLowerCase()
  const options = authors
    .filter((author) => !needle || author.name.toLocaleLowerCase().includes(needle))
    .map((author) => ({ value: `id:${author.id}`, label: author.name }))
  if (typed && !authors.some((author) => sameName(author.name, typed))) {
    options.push({ value: `new:${typed}`, label: `Add “${typed}”` })
  }
  return options
}

export function authorFromValue(value, authors) {
  if (value.startsWith('new:')) return { name: value.slice(4) }
  const id = Number(value.slice(3))
  return { id, name: authors.find((author) => author.id === id)?.name ?? '' }
}

export const valueOfAuthor = (author) => (author ? (author.id ? `id:${author.id}` : `new:${author.name}`) : undefined)

// The book payload's author: author_id for an existing one, author_name for one to create.
export const authorPayload = (author) => (author.id ? { author_id: author.id } : { author_name: author.name })
