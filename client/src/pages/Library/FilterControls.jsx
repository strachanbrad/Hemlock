/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Badge, Button, Drawer, Segmented, Select, Tag } from 'antd'
import { FilterOutlined } from '@ant-design/icons'
import { FILTER_LABELS, FILTER_ORDER, SORTS, activeFilterCount } from './filters.js'

const ALL = 'all'
const FILTERS = [
  { key: 'format', label: 'Format' },
  { key: 'owned', label: 'Owned' },
  { key: 'wishlist', label: 'Wishlist' },
  { key: 'read', label: 'Read' },
]

const choices = (key) => [{ value: ALL, label: 'All' }, ...FILTER_ORDER[key].map((value) => ({ value, label: FILTER_LABELS[key][value] }))]
const toFilter = (value) => (value === ALL ? null : value)

export const DesktopFilters = ({ filters, onChange }) => (
  <>
    {FILTERS.map(({ key, label }) => (
      <Select
        key={key}
        className="toolbar-select"
        aria-label={label}
        prefix={`${label}:`}
        value={filters[key] ?? ALL}
        options={choices(key)}
        popupMatchSelectWidth={false}
        onChange={(value) => onChange({ [key]: toFilter(value) })}
      />
    ))}
  </>
)

// On a phone the filters and the sort live in a bottom drawer: cards have no column headers.
export const PhoneFilters = ({ filters, open, onOpen, onClose, onChange }) => {
  const count = activeFilterCount(filters)
  return (
    <>
      <Badge count={count} size="small" className="filters-badge">
        <Button icon={<FilterOutlined aria-hidden="true" />} onClick={onOpen}>Filters</Button>
      </Badge>
      <Drawer title="Filters and sort" placement="bottom" size="auto" open={open} onClose={onClose} className="filters-drawer">
        <div className="filters-drawer-body">
          <label className="filters-field">
            <span>Format</span>
            <Select value={filters.format ?? ALL} options={choices('format')} onChange={(value) => onChange({ format: toFilter(value) })} />
          </label>
          {FILTERS.slice(1).map(({ key, label }) => (
            <div key={key} className="filters-field" role="group" aria-label={label}>
              <span>{label}</span>
              <Segmented block value={filters[key] ?? ALL} options={choices(key)} onChange={(value) => onChange({ [key]: toFilter(value) })} />
            </div>
          ))}
          <label className="filters-field">
            <span>Sort by</span>
            <Select value={filters.sort} options={Object.entries(SORTS).map(([value, label]) => ({ value, label }))} onChange={(sort) => onChange({ sort })} />
          </label>
          <Button block type="primary" onClick={onClose}>Show books</Button>
        </div>
      </Drawer>
    </>
  )
}

export const ActiveFilters = ({ filters, authorName, onChange }) => {
  const tags = FILTERS.filter(({ key }) => filters[key] !== null)
    .map(({ key }) => ({ key, label: FILTER_LABELS[key][filters[key]] }))
  if (filters.author_id !== null) tags.push({ key: 'author_id', label: `Author: ${authorName ?? 'one author'}` })
  if (tags.length === 0) return null
  return (
    <div className="active-filters">
      {tags.map(({ key, label }) => (
        <Tag key={key} closable onClose={() => onChange({ [key]: null })}>{label}</Tag>
      ))}
    </div>
  )
}
