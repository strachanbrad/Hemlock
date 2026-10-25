/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useSyncExternalStore } from 'react'

export const PHONE_QUERY = '(max-width: 767.98px)'

function subscribe(onChange) {
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const isPhoneNow = () => window.matchMedia(PHONE_QUERY).matches

// Reads matchMedia during render, so the first paint already has the right layout.
export function useIsPhone() {
  return useSyncExternalStore(subscribe, isPhoneNow, () => false)
}
