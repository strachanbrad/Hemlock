import React, { useState } from 'react';
import { Layout, Menu, Breadcrumb, Modal, Button } from 'antd';
import Authors from './Authors'
import Books from './Books'
import BuyList from './BuyList'
import BookDetailModal from './BookDetailModal';
import AddBooks from './AddBooks'
import BookCarousel from './BookCarousel'
import {
  UserOutlined,
  GlobalOutlined,
  BookOutlined,
  PlusOutlined,
  BellOutlined,
  DollarOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import config from '../config/config.json'

const { Header, Content, Sider } = Layout;

// Define the menu items for the side navigation
const siderItems = [
  {
    key: 'authors',
    icon: <UserOutlined />,
    label: 'Authors',
    component: Authors,
  },
  {
    key: 'books',
    icon: <BookOutlined />,
    label: 'Books',
    component: () => <Books bookType='Books' />,
  },
  {
    key: 'ebooks',
    icon: <GlobalOutlined />,
    label: 'Ebooks',
    component: () => <Books bookType='EBooks' />,
  },
  {
    key: 'buy',
    icon: <DollarOutlined />,
    label: 'Buy List',
    component: BuyList,
  },
  {
    key: 'addBooks',
    icon: <PlusOutlined />,
    label: 'Add Books',
    component: AddBooks,
  },
  {
    key: 'bookCarousel',
    icon: <PictureOutlined />,
    label: 'Carousel',
    component: BookCarousel,
  },
];

const App = () => {
  // State for controlling the visibility of the modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState('authors');  // Default selection

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleOk = () => {
    setIsModalOpen(false);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  const onMenuSelect = ({ key }) => {
    setSelectedKey(key);
  };

  const renderContentComponent = () => {
    const item = siderItems.find((item) => item.key === selectedKey);
    return item ? <item.component /> : null;
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={config.logo} alt="logo" style={{ width: 'auto', height: '48px' }} />
          <h1 style={{ marginLeft: '25px', fontWeight: 'bold' }}>{config.website.title}</h1>
        </div>
        <Button icon={<BellOutlined />} type="link" onClick={showModal} />
      </Header>
      <Layout>
        <Sider width={200}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            onSelect={onMenuSelect}
            style={{ height: '100%', borderRight: 0 }}
            items={siderItems.map(({ key, icon, label }) => ({
              key,
              icon,
              label,
            }))}          />
        </Sider>
        <Layout style={{ padding: '0 24px 24px', height:'100%' }}>
          <Breadcrumb style={{ margin: '16px 0' }} items={[
            {title: config.website.title},
            {title: siderItems.find((item) => item.key === selectedKey)?.label}
          ]}/>
          <Content
            style={{
              background: '#fff',
              padding: 24,
              margin: 0,
              minHeight: 280,
            }}
          >
            {renderContentComponent()}
          </Content>
        </Layout>
      </Layout>

      <Modal title="Carousel Placeholder" open={isModalOpen} onOk={handleOk} onCancel={handleCancel}>
        {/* This will be replaced with your carousel component */}
        <p>Carousel Component Placeholder</p>
      </Modal>
      <BookDetailModal width={'90vw'} centered />
    </Layout>
  );
};

export default App;
