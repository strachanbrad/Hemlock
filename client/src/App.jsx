/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { lazy, Suspense } from 'react'
import { Layout, Menu } from 'antd'
import { BookOutlined, DesktopOutlined, PlusOutlined, ShoppingOutlined, UserOutlined } from '@ant-design/icons'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import AddBook from './pages/AddBook/AddBook.jsx'
import Authors from './pages/Authors/Authors.jsx'
import Library from './pages/Library/Library.jsx'
import ScanTest from './pages/ScanTest/ScanTest.jsx'
import config from './config/config.json'
import { useIsPhone } from './lib/viewport.js'
import './styles/shell.css'

const { Header, Content, Sider } = Layout

const Display = lazy(() => import('./pages/Display/Display.jsx'))

const NAV = [
  { key: 'library', to: '/library', label: 'Library', icon: <BookOutlined /> },
  { key: 'buy', to: '/library?wishlist=1', label: 'Buy list', icon: <ShoppingOutlined /> },
  { key: 'add', to: '/add', label: 'Add book', short: 'Add', icon: <PlusOutlined /> },
  { key: 'authors', to: '/authors', label: 'Authors', icon: <UserOutlined /> },
]

const MENU_ITEMS = [
  ...NAV.map(({ key, to, label, icon }) => ({ key, icon, label: <Link to={to}>{label}</Link> })),
  { key: 'display', icon: <DesktopOutlined />, label: <a href="/display" target="_blank" rel="noopener">Display</a> },
]

function currentKey({ pathname, search }) {
  if (pathname.startsWith('/library')) return new URLSearchParams(search).get('wishlist') === '1' ? 'buy' : 'library'
  return NAV.find((item) => pathname.startsWith(item.to))?.key
}

const Shell = () => {
  const isPhone = useIsPhone()
  const location = useLocation()
  const current = currentKey(location)

  return (
    <Layout className={isPhone ? 'shell shell-phone' : 'shell shell-desktop'}>
      <Header className="shell-header">
        <Link to="/library" className="shell-brand">
          <img src={config.logo} alt="" className="shell-logo" />
          <h1 className="shell-title">{config.website.title}</h1>
        </Link>
      </Header>
      {isPhone ? (
        <>
          <Content className="shell-content"><Outlet /></Content>
          <nav className="tab-bar" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className={item.key === current ? 'tab-bar-item tab-bar-item-active' : 'tab-bar-item'}
                aria-current={item.key === current ? 'page' : undefined}
              >
                {item.icon}
                <span>{item.short ?? item.label}</span>
              </Link>
            ))}
          </nav>
        </>
      ) : (
        <Layout>
          <Sider width={200} className="shell-sider">
            <Menu mode="inline" selectedKeys={current ? [current] : []} items={MENU_ITEMS} className="shell-menu" />
          </Sider>
          <Content className="shell-content"><Outlet /></Content>
        </Layout>
      )}
    </Layout>
  )
}

const App = () => (
  <Routes>
    <Route path="/" element={<Shell />}>
      <Route index element={<Navigate to="/library" replace />} />
      <Route path="library/:id?" element={<Library />} />
      <Route path="add" element={<AddBook />} />
      <Route path="authors" element={<Authors />} />
      <Route path="*" element={<Navigate to="/library" replace />} />
    </Route>
    <Route path="/display" element={<Suspense fallback={null}><Display /></Suspense>} />
    <Route path="/scan-test" element={<ScanTest />} />
  </Routes>
)

export default App
