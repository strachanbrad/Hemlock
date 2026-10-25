/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useId, useMemo } from 'react'
import { CHILLI, FACE_WIDTH, bandPath, bloodOf, chilliLine, dripGeometry, poolPath, ratingLevel, seedOf } from './effects.js'

const px = (value) => `${value}px`

function Blood({ id, gore, height }) {
  const blood = useMemo(() => bloodOf(gore, seedOf(id), height), [gore, id, height])
  const drips = useMemo(() => blood?.drips.map((drip) => ({ drip, shape: dripGeometry(drip) })), [blood])
  if (!blood) return null
  const timing = (drip) => ({ '--delay': `${drip.delay}s`, '--duration': `${drip.duration}s` })
  const fall = (drip, shape) => ({ ...timing(drip), '--from': px(-shape.run) })
  const rise = (pool) => ({ '--delay': `${pool.delay}s`, '--from': px(pool.height * 1.2) })
  const shapes = (
    <>
      {blood.bands.map((band) => <path key={band.side} className="display-blood-band" d={bandPath(band)} />)}
      {drips.map(({ drip, shape }, i) => (
        <path key={i} className="display-blood-trail" d={shape.trail} style={timing(drip)} />
      ))}
      {drips.map(({ drip, shape }, i) => (
        <path key={i} className="display-blood-bulb" d={shape.bulb} style={fall(drip, shape)} />
      ))}
      {blood.pools.map((pool) => (
        <path key={pool.side} className="display-blood-pool" d={poolPath(pool, height)} style={rise(pool)} />
      ))}
    </>
  )

  return (
    <svg className="display-blood" viewBox={`0 0 ${FACE_WIDTH} ${height}`} data-level={blood.level} aria-hidden="true">
      <svg width={FACE_WIDTH} height={height}>
        <g className="display-blood-rim">{shapes}</g>
        <g className="display-blood-body">{shapes}</g>
        <g className="display-blood-shine">
          {drips.map(({ drip, shape }, i) => shape.streak && (
            <path key={i} className="display-blood-trail" d={shape.streak} strokeWidth={shape.streakWidth} style={timing(drip)} />
          ))}
          {drips.map(({ drip, shape }, i) => !drip.pooled && (
            <path key={i} className="display-blood-bulb display-blood-glint" d={shape.glint} strokeWidth={shape.glintWidth} style={fall(drip, shape)} />
          ))}
        </g>
      </svg>
    </svg>
  )
}

const SIZE = { width: 11, height: 17.6, margin: 2.5 }

// The fill rises by moving its clip window up while the gradient inside moves down by as much, so the
// gradient stays still and the level only uncovers it.
function Chilli({ spice, height }) {
  const ids = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const level = ratingLevel(spice)
  if (level === 0) return null
  const line = chilliLine(level)
  const drop = CHILLI.tip - line
  return (
    <svg className="display-chilli" viewBox={`0 0 ${FACE_WIDTH} ${height}`} data-level={level} aria-hidden="true">
      <svg
        x={FACE_WIDTH - SIZE.margin - SIZE.width}
        y={height - SIZE.margin - SIZE.height}
        width={SIZE.width}
        height={SIZE.height}
        viewBox="0 0 40 64"
      >
        <defs>
          <linearGradient id={`${ids}-heat`} gradientUnits="userSpaceOnUse" x1="0" y1={CHILLI.tip} x2="0" y2={CHILLI.top}>
            <stop offset="0" className="display-chilli-amber" />
            <stop offset="0.45" className="display-chilli-orange" />
            <stop offset="1" className="display-chilli-red" />
          </linearGradient>
          <clipPath id={`${ids}-pod`}>
            <path d={CHILLI.pod} />
          </clipPath>
          <clipPath id={`${ids}-fill`}>
            <rect x="0" y={line} width="40" height={64 - line} />
          </clipPath>
        </defs>
        <g className="display-chilli-halo">
          <path d={CHILLI.pod} />
          <path d={CHILLI.calyx} />
          <path d={CHILLI.stem} />
        </g>
        <g clipPath={`url(#${ids}-pod)`}>
          <rect className="display-chilli-wash" x="0" y="0" width="40" height="64" />
          <g className="display-chilli-rise" clipPath={`url(#${ids}-fill)`} style={{ '--from': px(drop) }}>
            <rect className="display-chilli-rise" x="0" y="0" width="40" height="64" fill={`url(#${ids}-heat)`} style={{ '--from': px(-drop) }} />
          </g>
          {level < 5 && (
            <line className="display-chilli-rise display-chilli-level" x1="0" y1={line} x2="40" y2={line} style={{ '--from': px(drop) }} />
          )}
        </g>
        <path className="display-chilli-shine" d={CHILLI.shine} />
        <path className="display-chilli-pod" d={CHILLI.pod} />
        <path className="display-chilli-stem" d={CHILLI.calyx} />
        <path className="display-chilli-stem" d={CHILLI.stem} />
      </svg>
    </svg>
  )
}

export default function CoverEffects({ id, gore, spice, height }) {
  return (
    <>
      <Blood id={id} gore={gore} height={height} />
      <Chilli spice={spice} height={height} />
    </>
  )
}
