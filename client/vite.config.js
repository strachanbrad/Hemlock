/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

const server = `http://127.0.0.1:${process.env.PORT || 5000}`

export default defineConfig({
  plugins: [react(), svgr()],
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
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
