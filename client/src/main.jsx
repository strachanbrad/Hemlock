/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App as AntApp, ConfigProvider } from 'antd'
import './styles/index.css'
import config from './config/config.json'
import App from './App.jsx'

const { theme } = config.website

const defaultTheme = {
  token: {
    colorPrimary: theme.primary,
    colorInfo: theme.primary,
    colorBgBase: theme.bgBase,
    colorTextBase: theme.textBase,
    sizeStep: theme.sizeStep,
    wireframe: false,
    borderRadius: theme.borderRadius,
  },
  components: {
    Layout: {
      headerBg: theme.primary,
      siderBg: theme.bgBase,
    },
    Table: {
      rowSelectedBg: theme.secondary,
      rowSelectedHoverBg: theme.tertiary,
    },
    Typography: {
      titleMarginTop: '0em',
    },
  },
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider direction="ltr" theme={defaultTheme}>
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </StrictMode>
)
