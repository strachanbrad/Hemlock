/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

const STEPS = [1, 2, 3, 4, 5]

// Controlled. Without onChange it is read-only. Choosing 1 again clears the rating to 0.
const Rating = ({ value = 0, onChange, filledIcon: Filled, unfilledIcon: Unfilled, label, kind, size = 'medium' }) => {
  const className = `rating rating-${size}${kind ? ` rating-${kind}` : ''}`
  const state = (step) => (step <= value ? 'is-filled' : 'is-empty')
  if (!onChange) {
    return (
      <span className={className} role="img" aria-label={`${label}: ${value} of 5`}>
        {STEPS.map((step) => {
          const Icon = step <= value ? Filled : Unfilled
          return <span key={step} className={`rating-icon ${state(step)}`}><Icon aria-hidden="true" /></span>
        })}
      </span>
    )
  }

  return (
    <span className={className} role="group" aria-label={label}>
      {STEPS.map((step) => {
        const Icon = step <= value ? Filled : Unfilled
        return (
          <button
            key={step}
            type="button"
            className={`rating-icon rating-button ${state(step)}`}
            aria-label={`${label} ${step} of 5`}
            aria-pressed={step <= value}
            onClick={(event) => {
              event.stopPropagation()
              onChange(step === 1 && value === 1 ? 0 : step)
            }}
          >
            <Icon aria-hidden="true" />
          </button>
        )
      })}
    </span>
  )
}

export default Rating
