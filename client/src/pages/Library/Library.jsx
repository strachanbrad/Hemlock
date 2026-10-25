/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, Empty, Spin } from 'antd'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useIsPhone } from '../../lib/viewport.js'
import BookDrawer from './BookDrawer.jsx'
import { ActiveFilters, DesktopFilters, PhoneFilters } from './FilterControls.jsx'
import LibraryCards from './LibraryCards.jsx'
import LibraryTable from './LibraryTable.jsx'
import SearchBox from './SearchBox.jsx'
import { EMPTY_FILTERS, activeFilterCount, apiQuery, filtersFromSearch, isBuyList, searchFromFilters, sortBooks } from './filters.js'
import { useLibrary } from './useLibrary.js'
import '../../styles/library.css'

const Library = () => {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => filtersFromSearch(params), [params])
  const navigate = useNavigate()
  const location = useLocation()
  const isPhone = useIsPhone()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const library = useLibrary(apiQuery(filters), id)

  const changeFilters = useCallback(
    (changes) => setParams(searchFromFilters({ ...filters, ...changes }), { replace: true }),
    [filters, setParams],
  )
  const changeSearch = useCallback((q) => changeFilters({ q }), [changeFilters])

  const linkTo = (bookId) => ({ pathname: `/library/${bookId}`, search: location.search })
  const openBook = (bookId, state = {}) => navigate(linkTo(bookId), { state: { fromList: true, ...state } })
  const closeBook = () => {
    if (location.state?.fromList) navigate(-1)
    else navigate({ pathname: '/library', search: location.search }, { replace: true })
  }

  const books = useMemo(() => sortBooks(library.books, filters.sort), [library.books, filters.sort])
  const buyList = isBuyList(filters)
  const authorName = filters.author_id && library.books.find((book) => String(book.author.id) === filters.author_id)?.author.name
  const filtered = filters.q.trim() !== '' || activeFilterCount(filters) > 0
  const clearFilters = () => setParams(searchFromFilters(EMPTY_FILTERS), { replace: true })

  let body
  if (library.error) {
    body = <Alert type="error" showIcon title="Could not load the library" description={library.error} />
  } else if (!library.loading && books.length === 0) {
    body = (
      <Empty description={filtered ? 'No books match' : 'No books yet'}>
        {filtered ? <Button onClick={clearFilters}>Clear filters</Button> : <Button type="primary" onClick={() => navigate('/add')}>Add a book</Button>}
      </Empty>
    )
  } else if (isPhone) {
    body = (
      <Spin spinning={library.loading}>
        <LibraryCards books={books} linkTo={linkTo} onOpen={openBook} onSave={library.save} onPurchase={buyList ? (book) => openBook(book.id, { mode: 'purchase' }) : null} />
      </Spin>
    )
  } else {
    body = <LibraryTable books={books} linkTo={linkTo} onOpen={openBook} onSave={library.save} loading={library.loading} />
  }

  return (
    <section className="library">
      <h2 className="page-title">{buyList ? 'Buy list' : 'Library'}</h2>
      {isPhone ? (
        <div className="library-search">
          <div className="library-search-row">
            <SearchBox className="library-search-input" value={filters.q} onChange={changeSearch} />
            <PhoneFilters filters={filters} open={filtersOpen} onOpen={() => setFiltersOpen(true)} onClose={() => setFiltersOpen(false)} onChange={changeFilters} />
          </div>
          <ActiveFilters filters={filters} authorName={authorName} onChange={changeFilters} />
        </div>
      ) : (
        <div className="library-toolbar">
          <SearchBox className="toolbar-search" value={filters.q} onChange={changeSearch} />
          <DesktopFilters filters={filters} onChange={changeFilters} />
          <ActiveFilters filters={{ ...EMPTY_FILTERS, author_id: filters.author_id }} authorName={authorName} onChange={changeFilters} />
        </div>
      )}
      {body}
      <BookDrawer
        open={Boolean(id)}
        bookId={id}
        book={library.openBook}
        loaded={library.openBookLoaded}
        error={library.openError}
        initialMode={location.state?.mode}
        onClose={closeBook}
        onSave={library.save}
        onReplace={library.apply}
        onDeleted={(bookId) => {
          library.remove(bookId)
          closeBook()
        }}
      />
    </section>
  )
}

export default Library
