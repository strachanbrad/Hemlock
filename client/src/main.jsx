/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App as AntApp, ConfigProvider, theme as antTheme } from 'antd'
import '@fontsource-variable/cormorant-garamond'
import '@fontsource-variable/cormorant-garamond/wght-italic.css'
import '@fontsource-variable/lora'
import '@fontsource-variable/lora/wght-italic.css'
import '@fontsource-variable/inter'
import './styles/index.css'
import config from './config/config.json'
import App from './App.jsx'
import { renderEmpty } from './components/ShelfEmpty.jsx'

const c = config.website.theme
const FONT_UI = "'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const brassFaint = 'rgba(201, 168, 106, 0.18)'
const brassFocus = '0 0 0 2px rgba(201, 168, 106, 0.28)'
const primaryWash = 'rgba(137, 2, 62, 0.32)'

const hemlockTheme = {
  algorithm: antTheme.darkAlgorithm,
  token: {
    colorPrimary: c.primary,
    colorPrimaryHover: c.primaryHover,
    colorPrimaryActive: c.primaryActive,
    colorInfo: c.brass,
    colorSuccess: c.sage,
    colorWarning: c.warning,
    colorError: c.danger,
    colorLink: c.brass,
    colorLinkHover: c.brassLight,
    colorLinkActive: c.brass,
    colorBgBase: c.ink,
    colorTextBase: c.cream,
    colorBgLayout: c.ink,
    colorBgContainer: c.surface,
    colorBgElevated: c.raised,
    colorText: c.cream,
    colorTextSecondary: c.muted,
    colorTextTertiary: c.faint,
    colorTextDescription: c.faint,
    colorTextPlaceholder: c.faint,
    colorTextHeading: c.cream,
    colorBorder: c.border,
    colorBorderSecondary: brassFaint,
    colorSplit: brassFaint,
    controlOutline: 'rgba(201, 168, 106, 0.28)',
    controlItemBgActive: primaryWash,
    controlItemBgActiveHover: 'rgba(137, 2, 62, 0.42)',
    fontFamily: FONT_UI,
    fontSize: 14,
    sizeStep: c.sizeStep,
    borderRadius: c.borderRadius,
    wireframe: false,
  },
  components: {
    Layout: {
      headerBg: c.inkDeep,
      siderBg: c.inkDeep,
      bodyBg: 'transparent',
      headerPadding: '0 24px',
    },
    Menu: {
      darkItemBg: c.inkDeep,
      itemBg: c.inkDeep,
      itemColor: c.muted,
      itemHoverColor: c.cream,
      itemHoverBg: 'rgba(239, 230, 218, 0.05)',
      itemSelectedColor: c.cream,
      itemSelectedBg: primaryWash,
      itemActiveBg: primaryWash,
      itemBorderRadius: 2,
    },
    Table: {
      colorBgContainer: 'rgba(239, 230, 218, 0.035)',
      headerBg: 'rgba(15, 13, 18, 0.6)',
      headerColor: c.brass,
      headerSortActiveBg: 'rgba(15, 13, 18, 0.75)',
      headerSortHoverBg: 'rgba(15, 13, 18, 0.75)',
      headerSplitColor: 'transparent',
      bodySortBg: 'transparent',
      rowHoverBg: 'rgba(239, 230, 218, 0.06)',
      borderColor: brassFaint,
      cellPaddingBlockSM: 10,
    },
    Drawer: {
      colorBgElevated: c.surface,
    },
    Modal: {
      contentBg: c.raised,
      headerBg: c.raised,
      titleColor: c.cream,
    },
    Card: {
      colorBgContainer: c.surface,
    },
    Input: {
      activeBorderColor: c.brass,
      hoverBorderColor: c.brassLight,
      activeShadow: brassFocus,
    },
    Select: {
      activeBorderColor: c.brass,
      hoverBorderColor: c.brassLight,
      activeOutlineColor: 'rgba(201, 168, 106, 0.22)',
      optionSelectedBg: primaryWash,
      optionSelectedColor: c.cream,
    },
    Button: {
      defaultBg: 'transparent',
      defaultColor: c.cream,
      defaultBorderColor: c.border,
      defaultHoverBg: 'rgba(201, 168, 106, 0.08)',
      defaultHoverColor: c.brassLight,
      defaultHoverBorderColor: c.brass,
      defaultActiveColor: c.brass,
      defaultActiveBorderColor: c.brass,
      primaryColor: c.cream,
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
      fontWeight: 500,
    },
    Tag: {
      defaultBg: 'transparent',
      defaultColor: c.muted,
    },
    Segmented: {
      trackBg: c.inkDeep,
      itemColor: c.muted,
      itemHoverColor: c.cream,
      itemHoverBg: 'rgba(239, 230, 218, 0.06)',
      itemSelectedBg: c.primary,
      itemSelectedColor: c.cream,
    },
    Radio: {
      buttonBg: 'transparent',
      buttonColor: c.cream,
      buttonSolidCheckedBg: c.primary,
      buttonSolidCheckedHoverBg: c.primaryHover,
      buttonSolidCheckedActiveBg: c.primaryActive,
      buttonSolidCheckedColor: c.cream,
    },
    Switch: {
      handleBg: c.cream,
    },
    Empty: {
      colorTextDescription: c.muted,
    },
    Typography: {
      titleMarginTop: '0em',
    },
  },
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider direction="ltr" theme={hemlockTheme} renderEmpty={renderEmpty}>
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </StrictMode>
)
