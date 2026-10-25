/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Rule } from '../images/ornaments/index.js'

export const PageHeading = ({ children, meta }) => (
  <header className="page-heading">
    <div className="page-heading-row">
      <h2 className="page-title">{children}</h2>
      {meta && <span className="page-meta">{meta}</span>}
    </div>
    <Rule className="page-rule" aria-hidden="true" />
  </header>
)

export const SectionHeading = ({ children, id }) => (
  <div className="section-heading">
    <h3 className="section-title" id={id}>{children}</h3>
    <Rule className="section-rule" aria-hidden="true" />
  </div>
)
