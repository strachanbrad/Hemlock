/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useEffect, useState } from 'react'
import { App } from 'antd'

// Loads a card's list once, and runs its actions one at a time: busy names the running action, and
// a 401 from either means the admin session has ended.
export function useAdminList(load, onSignedOut) {
  const { message } = App.useApp()
  const [list, setList] = useState(null)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    load({ signal: controller.signal }).then(
      (loaded) => controller.signal.aborted || setList(loaded),
      (err) => {
        if (controller.signal.aborted) return
        if (err.status === 401) onSignedOut({ expired: true })
        else setFailure(err.message)
      },
    )
    return () => controller.abort()
  }, [load, onSignedOut])

  const act = async (id, run, onError = (err) => message.error(err.message)) => {
    setBusy(id)
    try {
      await run()
    } catch (err) {
      if (err.status === 401) onSignedOut({ expired: true })
      else onError(err)
    } finally {
      setBusy(null)
    }
  }

  return { list, setList, failure, busy, act, message }
}
