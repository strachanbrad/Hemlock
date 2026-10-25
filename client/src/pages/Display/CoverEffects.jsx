/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useId, useMemo } from 'react'
import { FACE_WIDTH, bloodMarkup, chilliMarkup } from './effects.js'

// The markup is built from numbers and the page's own ids only, never from a book's text.
function Effect({ className, effect, height }) {
  if (!effect) return null
  return (
    <svg
      className={className}
      viewBox={`0 0 ${FACE_WIDTH} ${height}`}
      data-level={effect.level}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: effect.markup }}
    />
  )
}

export default function CoverEffects({ id, gore, spice, height }) {
  const ids = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const blood = useMemo(() => bloodMarkup(id, gore, height), [id, gore, height])
  const chilli = useMemo(() => chilliMarkup(spice, height, ids), [spice, height, ids])
  return (
    <>
      <Effect className="display-blood" effect={blood} height={height} />
      <Effect className="display-chilli" effect={chilli} height={height} />
    </>
  )
}
