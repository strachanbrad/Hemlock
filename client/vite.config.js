/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

const server = `http://127.0.0.1:${process.env.PORT || 5000}`
// HTTPS=1 is for testing on a phone over the LAN: the camera needs a secure origin, and the
// phone reaches the dev server only when it listens on every interface.
const lan = process.env.HTTPS === '1'

export default defineConfig({
  plugins: [react(), svgr(), ...(lan ? [basicSsl()] : [])],
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    host: lan ? true : 'localhost',
    // Fail on a busy port; by default Vite moves on to the next free one.
    strictPort: true,
    proxy: {
      '/api': server,
      '/covers': server,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
  },
})
