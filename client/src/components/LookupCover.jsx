/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Button } from 'antd'

// The one image the browser loads from another host: the lookup source's cover, shown
// before it is chosen. The server downloads it on save (cover_from_url).
const LookupCover = ({ url, onRemove }) => (
  <div className="lookup-cover">
    <img src={url} alt="The cover the lookup found" referrerPolicy="no-referrer" />
    <div className="lookup-cover-text">
      <span className="secondary">Found by the lookup; saved with the book unless you choose a file.</span>
      <Button size="small" onClick={onRemove}>Don’t use this cover</Button>
    </div>
  </div>
)

export default LookupCover
