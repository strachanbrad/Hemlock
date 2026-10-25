/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, Spin } from 'antd'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { PageHeading } from '../../components/Headings.jsx'
import ShelfEmpty from '../../components/ShelfEmpty.jsx'
import { useIsPhone } from '../../lib/viewport.js'
import BookDrawer from './BookDrawer.jsx'
import CoverFlow, { ViewToggle, useLibraryView } from './CoverFlow.jsx'
import { ActiveFilters, DesktopFilters, PhoneFilters } from './FilterControls.jsx'
import LibraryCards from './LibraryCards.jsx'
import LibraryTable from './LibraryTable.jsx'
import SearchBox from './SearchBox.jsx'
import { EMPTY_FILTERS, activeFilterCount, apiQuery, filtersFromSearch, isWishlist, searchFromFilters, sortBooks } from './filters.js'
import { useLibrary } from './useLibrary.js'
import '../../styles/library.css'

const countOf = (n) => (n === 1 ? '1 book' : `${n} books`)

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
  const [view, changeView] = useLibraryView(filters.view, changeFilters)

  const linkTo = (bookId) => ({ pathname: `/library/${bookId}`, search: location.search })
  const openBook = (bookId, state = {}) => navigate(linkTo(bookId), { state: { fromList: true, ...state } })
  const closeBook = () => {
    if (location.state?.fromList) navigate(-1)
    else navigate({ pathname: '/library', search: location.search }, { replace: true })
  }

  const books = useMemo(() => sortBooks(library.books, filters.sort), [library.books, filters.sort])
  const wishlist = isWishlist(filters)
  const authorName = filters.author_id && library.books.find((book) => String(book.author.id) === filters.author_id)?.author.name
  const filterCount = activeFilterCount(filters)
  const filtered = filters.q.trim() !== '' || filterCount > 0
  const onlyWishlist = wishlist && filterCount === 1 && filters.q.trim() === ''
  const clearFilters = () => setParams(searchFromFilters({ ...EMPTY_FILTERS, view: filters.view }), { replace: true })

  let body
  if (library.error) {
    body = <Alert type="error" showIcon title="Could not load the library" description={library.error} />
  } else if (!library.loading && books.length === 0) {
    const addBook = <Button type="primary" onClick={() => navigate('/add')}>Add a book</Button>
    if (onlyWishlist) body = <ShelfEmpty description="Nothing on the wishlist">{addBook}</ShelfEmpty>
    else if (filtered) body = <ShelfEmpty description="No books match"><Button onClick={clearFilters}>Clear filters</Button></ShelfEmpty>
    else body = <ShelfEmpty description="Nothing on the shelf yet">{addBook}</ShelfEmpty>
  } else if (view === 'flow') {
    body = <CoverFlow books={books} loading={library.loading} linkTo={linkTo} onOpen={openBook} />
  } else if (isPhone) {
    body = (
      <Spin spinning={library.loading}>
        <LibraryCards books={books} linkTo={linkTo} onOpen={openBook} onSave={library.save} onPurchase={wishlist ? (book) => openBook(book.id, { mode: 'purchase' }) : null} />
      </Spin>
    )
  } else {
    body = <LibraryTable books={books} linkTo={linkTo} onOpen={openBook} onSave={library.save} loading={library.loading} />
  }

  return (
    <section className="library">
      <PageHeading meta={library.loading || library.error || books.length === 0 ? null : countOf(books.length)}>{wishlist ? 'Wishlist' : 'Library'}</PageHeading>
      {isPhone ? (
        <div className="library-search">
          <div className="library-search-row">
            <SearchBox className="library-search-input" value={filters.q} onChange={changeSearch} />
            <PhoneFilters filters={filters} open={filtersOpen} onOpen={() => setFiltersOpen(true)} onClose={() => setFiltersOpen(false)} onChange={changeFilters} />
            <ViewToggle compact view={view} onChange={changeView} />
          </div>
          <ActiveFilters filters={filters} authorName={authorName} onChange={changeFilters} />
        </div>
      ) : (
        <div className="library-toolbar">
          <SearchBox className="toolbar-search" value={filters.q} onChange={changeSearch} />
          <DesktopFilters filters={filters} onChange={changeFilters} />
          <ActiveFilters filters={{ ...EMPTY_FILTERS, author_id: filters.author_id }} authorName={authorName} onChange={changeFilters} />
          <ViewToggle view={view} onChange={changeView} />
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
