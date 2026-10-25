/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it } from 'vitest'
import { authorFromValue, authorOptions, authorPayload, valueOfAuthor } from '../src/lib/authors.js'

const AUTHORS = [
  { id: 1, name: 'Jane Austen' },
  { id: 2, name: 'Emily Brontë' },
  { id: 3, name: 'Charlotte Brontë' },
]

describe('authorOptions', () => {
  it('lists every author when nothing is typed', () => {
    expect(authorOptions(AUTHORS, '').map((option) => option.label)).toEqual(['Jane Austen', 'Emily Brontë', 'Charlotte Brontë'])
  })

  it('filters by a case-insensitive substring and offers to add the typed name', () => {
    expect(authorOptions(AUTHORS, 'BRONT')).toEqual([
      { value: 'id:2', label: 'Emily Brontë' },
      { value: 'id:3', label: 'Charlotte Brontë' },
      { value: 'new:BRONT', label: 'Add “BRONT”' },
    ])
  })

  it('offers no add option when the typed name matches an author, whatever the case and spacing', () => {
    expect(authorOptions(AUTHORS, '  jane   AUSTEN ')).toEqual([{ value: 'id:1', label: 'Jane Austen' }])
    expect(authorOptions(AUTHORS, 'EMILY BRONTË')).toEqual([{ value: 'id:2', label: 'Emily Brontë' }])
  })

  it('offers to add a new name with its whitespace collapsed', () => {
    expect(authorOptions(AUTHORS, ' George   Eliot ')).toEqual([{ value: 'new:George Eliot', label: 'Add “George Eliot”' }])
  })

  it('offers to add a longer name that contains an existing one', () => {
    expect(authorOptions(AUTHORS, 'Jane Austen Society').at(-1)).toEqual({ value: 'new:Jane Austen Society', label: 'Add “Jane Austen Society”' })
  })
})

describe('author values', () => {
  it('turn a select value into an author and back', () => {
    expect(authorFromValue('id:3', AUTHORS)).toEqual({ id: 3, name: 'Charlotte Brontë' })
    expect(authorFromValue('new:George Eliot', AUTHORS)).toEqual({ name: 'George Eliot' })
    expect(valueOfAuthor({ id: 3, name: 'Charlotte Brontë' })).toBe('id:3')
    expect(valueOfAuthor({ name: 'George Eliot' })).toBe('new:George Eliot')
    expect(valueOfAuthor(undefined)).toBeUndefined()
  })

  it('send author_id for an existing author and author_name for a new one', () => {
    expect(authorPayload({ id: 3, name: 'Charlotte Brontë' })).toEqual({ author_id: 3 })
    expect(authorPayload({ name: 'George Eliot' })).toEqual({ author_name: 'George Eliot' })
  })
})
