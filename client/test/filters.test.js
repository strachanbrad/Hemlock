/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, activeFilterCount, apiQuery, filtersFromSearch, isWishlist, searchFromFilters, sortBooks } from '../src/pages/Library/filters.js'

const parse = (search) => filtersFromSearch(new URLSearchParams(search))

describe('filters from the address', () => {
  it('read every filter, the sort and the view', () => {
    expect(parse('q=bront&format=physical&owned=0&wishlist=1&read=1&author_id=3&sort=added&view=flow')).toEqual({
      q: 'bront', format: 'physical', owned: '0', wishlist: '1', read: '1', author_id: '3', sort: 'added', view: 'flow',
    })
  })

  it('default to no filters and the title sort', () => {
    expect(parse('')).toEqual(EMPTY_FILTERS)
  })

  it('ignore values the server would refuse', () => {
    expect(parse('format=audio&owned=yes&wishlist=0&read=2&author_id=0&sort=price&view=grid')).toEqual(EMPTY_FILTERS)
  })

  it('make wishlist=1 the wishlist view', () => {
    expect(isWishlist(parse('wishlist=1'))).toBe(true)
    expect(isWishlist(parse('format=ebook'))).toBe(false)
  })
})

describe('filters to the address and the API', () => {
  it('round-trip through the address, keeping the typed text as it is', () => {
    const filters = { ...EMPTY_FILTERS, q: 'jane ', format: 'ebook', wishlist: '1', sort: 'stars' }
    expect(searchFromFilters(filters)).toBe('q=jane+&format=ebook&wishlist=1&sort=stars')
    expect(parse(searchFromFilters(filters))).toEqual(filters)
  })

  it('keep the view in the address, never in the API query or the filter count', () => {
    const filters = { ...EMPTY_FILTERS, format: 'ebook', view: 'flow' }
    expect(searchFromFilters(filters)).toBe('format=ebook&view=flow')
    expect(parse(searchFromFilters(filters))).toEqual(filters)
    expect(parse('view=list').view).toBe('list')
    expect(apiQuery(filters)).toBe('format=ebook')
    expect(activeFilterCount(filters)).toBe(1)
  })

  it('leave the default sort out of the address', () => {
    expect(searchFromFilters({ ...EMPTY_FILTERS, read: '0' })).toBe('read=0')
  })

  it('send the trimmed text and the filters to the API, never the sort', () => {
    expect(apiQuery({ ...EMPTY_FILTERS, q: '  978-0-14-044912-9 ', owned: '0', author_id: '7', sort: 'gore' })).toBe('q=978-0-14-044912-9&owned=0&author_id=7')
    expect(apiQuery(EMPTY_FILTERS)).toBe('')
    expect(apiQuery({ ...EMPTY_FILTERS, q: '   ' })).toBe('')
  })

  it('count the active filters for the badge, not the text or the sort', () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, q: 'x', sort: 'added' })).toBe(0)
    expect(activeFilterCount(parse('format=ebook&wishlist=1&author_id=2'))).toBe(3)
  })
})

describe('sortBooks', () => {
  const book = (id, title, author, stars, created_at) => ({ id, title, author: { name: author }, star_rating: stars, spice_rating: 0, gore_rating: 0, created_at })
  const books = [
    book(1, 'emma', 'Jane Austen', 3, '2023-01-02 00:00:00'),
    book(2, 'Anna Karenina', 'Leo Tolstoy', 5, '2023-01-01 00:00:00'),
    book(3, 'Persuasion', 'Jane Austen', 5, '2023-01-03 00:00:00'),
  ]
  const titles = (sorted) => sorted.map((b) => b.title)

  it('sorts by title without regard to case, by default', () => {
    expect(titles(sortBooks(books, 'title'))).toEqual(['Anna Karenina', 'emma', 'Persuasion'])
    expect(titles(sortBooks(books, 'nonsense'))).toEqual(['Anna Karenina', 'emma', 'Persuasion'])
  })

  it('sorts by author then title, by rating highest first, and by newest first', () => {
    expect(titles(sortBooks(books, 'author'))).toEqual(['emma', 'Persuasion', 'Anna Karenina'])
    expect(titles(sortBooks(books, 'stars'))).toEqual(['Anna Karenina', 'Persuasion', 'emma'])
    expect(titles(sortBooks(books, 'added'))).toEqual(['Persuasion', 'emma', 'Anna Karenina'])
  })

  it('leaves the given array alone', () => {
    const copy = [...books]
    sortBooks(books, 'stars')
    expect(books).toEqual(copy)
  })
})
