/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Controlled: value is a boolean and onChange receives the opposite one. Without onChange it is read-only.
const ToggleIcon = ({ value = false, onChange, trueIcon: TrueIcon, falseIcon: FalseIcon, trueLabel, falseLabel, size = 'medium' }) => {
  const Icon = value ? TrueIcon : FalseIcon
  const label = value ? trueLabel : falseLabel
  const className = `toggle-icon toggle-icon-${size} ${value ? 'toggle-on' : 'toggle-off'}`
  if (!onChange) {
    return <span className={className} role="img" aria-label={label}><Icon aria-hidden="true" /></span>
  }
  return (
    <button
      type="button"
      className={`${className} toggle-button`}
      aria-label={label}
      aria-pressed={value}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        onChange(!value)
      }}
    >
      <Icon aria-hidden="true" />
    </button>
  )
}

export default ToggleIcon
