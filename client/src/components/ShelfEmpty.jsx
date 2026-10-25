/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Empty } from 'antd'
import { Sprig, Umbel } from '../images/ornaments/index.js'

const ShelfEmpty = ({ description, children }) => (
  <Empty className="shelf-empty" image={<Sprig className="shelf-empty-art" aria-hidden="true" />} description={description}>
    {children}
  </Empty>
)

export const renderEmpty = (componentName) => (componentName === 'Table' || componentName === 'List'
  ? <ShelfEmpty description="Nothing here yet" />
  : <div className="shelf-empty-compact"><Umbel aria-hidden="true" />Nothing here</div>)

export default ShelfEmpty
