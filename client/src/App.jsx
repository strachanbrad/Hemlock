/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { lazy, Suspense, useEffect, useState } from 'react'
import { App as AntApp, Layout, Menu } from 'antd'
import { BookOutlined, DesktopOutlined, LogoutOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons'
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router'
import { onSignedOut } from './api/request.js'
import { logout, session } from './api/session.js'
import AddBook from './pages/AddBook/AddBook.jsx'
import Authors from './pages/Authors/Authors.jsx'
import Library from './pages/Library/Library.jsx'
import Login from './pages/Login/Login.jsx'
import config from './config/config.json'
import { BookmarkOutline } from './images/index.js'
import { Ribcage, Umbel } from './images/ornaments/index.js'
import { useIsPhone } from './lib/viewport.js'
import './styles/shell.css'

const { Header, Content, Sider } = Layout

const Display = lazy(() => import('./pages/Display/Display.jsx'))
// Reached only by its address: no sider item and no tab leads to it.
const Admin = lazy(() => import('./pages/Admin/Admin.jsx'))

const NAV = [
  { key: 'library', to: '/library', label: 'Library', icon: <BookOutlined /> },
  { key: 'wishlist', to: '/library?wishlist=1', label: 'Wishlist', icon: <span className="anticon"><BookmarkOutline aria-hidden="true" /></span> },
  { key: 'add', to: '/add', label: 'Add book', short: 'Add', icon: <PlusOutlined /> },
  { key: 'authors', to: '/authors', label: 'Authors', icon: <UserOutlined /> },
]

const navLabel = (label) => (
  <>
    <span>{label}</span>
    <Umbel className="nav-umbel" aria-hidden="true" />
  </>
)

const SIGN_OUT = { key: 'signout', icon: <LogoutOutlined />, label: 'Sign out' }

// The signed-in user's name titles Sign out; it is null when the session check could not answer.
const menuItems = (name) => [
  ...NAV.map(({ key, to, label, icon }) => ({ key, icon, label: <Link to={to}>{navLabel(label)}</Link> })),
  { key: 'display', icon: <DesktopOutlined />, label: <a href="/display" target="_blank" rel="noopener">Display</a> },
  { type: 'divider' },
  name ? { type: 'group', key: 'user', label: name, children: [SIGN_OUT] } : SIGN_OUT,
]

const loginPath = ({ pathname, search, hash }) => `/login?${new URLSearchParams({ next: `${pathname}${search}${hash}` })}`

function currentKey({ pathname, search }) {
  if (pathname.startsWith('/library')) return new URLSearchParams(search).get('wishlist') === '1' ? 'wishlist' : 'library'
  return NAV.find((item) => pathname.startsWith(item.to))?.key
}

const Wordmark = () => (
  <Link to="/library" className="shell-brand">
    <img src={config.logo} alt="" className="shell-logo" />
    <h1 className="shell-title">
      Hemlock
    </h1>
  </Link>
)

// Checks the session once when it mounts; a later 401 from any request sends the visitor to the
// login page, back to this page once signed in.
const Shell = () => {
  const isPhone = useIsPhone()
  const location = useLocation()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const [user, setUser] = useState(undefined)
  const current = currentKey(location)

  useEffect(() => {
    const controller = new AbortController()
    // An unreachable server is not a signed-out visitor: the pages say what failed.
    session({ signal: controller.signal }).then(
      (found) => controller.signal.aborted || setUser(found),
      () => controller.signal.aborted || setUser({ name: null }),
    )
    return () => controller.abort()
  }, [])

  useEffect(() => onSignedOut(() => navigate(loginPath(location), { replace: true })), [location, navigate])

  const signOut = async () => {
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (err) {
      message.error(err.message)
    }
  }

  if (user === undefined) return null
  if (user === null) return <Navigate to={loginPath(location)} replace />

  return (
    <Layout className={isPhone ? 'shell shell-phone' : 'shell shell-desktop'}>
      <Header className="shell-header">
        <Wordmark />
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
            <button type="button" className="tab-bar-item" onClick={signOut}>
              <LogoutOutlined />
              <span>Sign out</span>
            </button>
          </nav>
        </>
      ) : (
        <Layout>
          <Sider width={200} className="shell-sider">
            <Menu
              mode="inline"
              selectedKeys={current ? [current] : []}
              items={menuItems(user.name)}
              onClick={({ key }) => key === 'signout' && signOut()}
              className="shell-menu"
            />
          </Sider>
          <Content className="shell-content">
            <Ribcage className="shell-watermark" aria-hidden="true" />
            <Outlet />
          </Content>
        </Layout>
      )}
    </Layout>
  )
}

const App = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<Shell />}>
      <Route index element={<Navigate to="/library" replace />} />
      <Route path="library/:id?" element={<Library />} />
      <Route path="add" element={<AddBook />} />
      <Route path="authors" element={<Authors />} />
      <Route path="admin" element={<Suspense fallback={null}><Admin /></Suspense>} />
      <Route path="*" element={<Navigate to="/library" replace />} />
    </Route>
    <Route path="/display" element={<Suspense fallback={null}><Display /></Suspense>} />
  </Routes>
)

export default App
