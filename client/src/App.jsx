/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { lazy, Suspense, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router'
import { Layout, Menu, Breadcrumb, Modal, Button } from 'antd'
import {
  UserOutlined,
  GlobalOutlined,
  BookOutlined,
  PlusOutlined,
  BellOutlined,
  DollarOutlined,
  PictureOutlined,
} from '@ant-design/icons'
import Authors from './pages/Authors/Authors.jsx'
import Books from './pages/Books/Books.jsx'
import BuyList from './pages/BuyList/BuyList.jsx'
import AddBooks from './pages/AddBooks/AddBooks.jsx'
import BookDetailModal from './components/BookDetailModal.jsx'
import config from './config/config.json'

const { Header, Content, Sider } = Layout

const Display = lazy(() => import('./pages/Display/Display.jsx'))

const menuItems = [
  { key: '/authors', icon: <UserOutlined />, label: 'Authors' },
  { key: '/books', icon: <BookOutlined />, label: 'Books' },
  { key: '/ebooks', icon: <GlobalOutlined />, label: 'Ebooks' },
  { key: '/buy', icon: <DollarOutlined />, label: 'Buy List' },
  { key: '/add', icon: <PlusOutlined />, label: 'Add Books' },
  { key: '/display', icon: <PictureOutlined />, label: <a href="/display" target="_blank" rel="noopener">Display</a> },
]

const Shell = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const selectedKey = `/${pathname.split('/')[1]}`

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={config.logo} alt="logo" style={{ width: 'auto', height: '48px' }} />
          <h1 style={{ marginLeft: '25px', fontWeight: 'bold' }}>{config.website.title}</h1>
        </div>
        <Button icon={<BellOutlined />} type="link" onClick={() => setIsModalOpen(true)} />
      </Header>
      <Layout>
        <Sider width={200}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            onClick={({ key }) => key !== '/display' && navigate(key)}
            style={{ height: '100%', borderRight: 0 }}
            items={menuItems}
          />
        </Sider>
        <Layout style={{ padding: '0 24px 24px', height: '100%' }}>
          <Breadcrumb
            style={{ margin: '16px 0' }}
            items={[
              { title: config.website.title },
              { title: menuItems.find((item) => item.key === selectedKey)?.label },
            ]}
          />
          <Content
            style={{
              background: '#fff',
              padding: 24,
              margin: 0,
              minHeight: 280,
            }}
          >
            <Outlet />
          </Content>
        </Layout>
      </Layout>

      <Modal
        title="Carousel Placeholder"
        open={isModalOpen}
        onOk={() => setIsModalOpen(false)}
        onCancel={() => setIsModalOpen(false)}
      >
        <p>Carousel Component Placeholder</p>
      </Modal>
      <BookDetailModal width={'90vw'} centered />
    </Layout>
  )
}

const App = () => (
  <Routes>
    <Route path="/" element={<Shell />}>
      <Route index element={<Navigate to="/authors" replace />} />
      <Route path="authors" element={<Authors />} />
      <Route path="books" element={<Books key="Books" bookType="Books" />} />
      <Route path="ebooks" element={<Books key="EBooks" bookType="EBooks" />} />
      <Route path="buy" element={<BuyList />} />
      <Route path="add" element={<AddBooks />} />
      <Route path="*" element={<Navigate to="/authors" replace />} />
    </Route>
    <Route path="/display" element={<Suspense fallback={null}><Display /></Suspense>} />
  </Routes>
)

export default App
