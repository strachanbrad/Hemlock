/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useEffect, useState } from 'react'
import { App, Button, Table, Input, Select, Space, Popconfirm } from 'antd'
import { SearchOutlined, PlusOutlined, MinusOutlined, DollarOutlined } from '@ant-design/icons'
import ToggleIcon from '../../components/ToggleIcon.jsx'
import { useAlertModal } from '../../components/AlertModalContext.jsx'
import config from '../../config/config.json'
import { fetchAuthors } from '../../api/authors.js'
import { fetchBooks, updateBookDetail, convertEBookToBook } from '../../api/books.js'

const bookType = 'EBooks'

const PurchaseSelect = ({ onOk, record }) => {
  const [selectedValue, setSelectedValue] = useState()

  const handleOk = () => {
    if (selectedValue) {
      onOk(selectedValue, record)
    }
  }

  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Select
        style={{ width: '100%' }}
        onSelect={setSelectedValue}
        options={[
          { value: 'Hardcover', label: 'Hardcover' },
          { value: 'Paperback', label: 'Paperback' },
        ]}
      />
      <Popconfirm
        title="Confirm Purchase"
        description={`Are you sure you want to transfer ${record.title} to Books?`}
        onConfirm={handleOk}
      >
        <Button type="primary" disabled={!selectedValue} style={{ float: 'right' }}>
          OK
        </Button>
      </Popconfirm>
    </Space>
  )
}

const BuyList = () => {
  const { message } = App.useApp()
  const [books, setBooks] = useState([])
  const [authors, setAuthors] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const { showModal, hideModal } = useAlertModal()

  useEffect(() => {
    fetchBooks(setBooks, bookType)
    fetchAuthors(setAuthors)
  }, [])

  const mergedBooks = authors.length > 0
    ? books.filter((book) => book.buy).map((book) => {
        const author = authors.find((author) => author.author_id === book.author_id)
        return { ...book, author: author ? `${author.first_name} ${author.last_name}` : 'Unknown' }
      })
    : []

  const lowercasedFilter = searchTerm.toLowerCase()
  const filteredBooks = mergedBooks.filter((book) =>
    book.title.toLowerCase().includes(lowercasedFilter) ||
    book.isbn.toString().includes(lowercasedFilter) ||
    book.author.toLowerCase().includes(lowercasedFilter)
  )

  const handleValueChange = async (isbn, newRating, field) => {
    await updateBookDetail(isbn, { [field]: newRating }, bookType, null)
    setBooks(books.map((book) => (book.isbn === isbn ? { ...book, [field]: newRating } : book)))
  }

  const handlePurchase = (record) => {
    showModal('Select a media type', () => (
      <PurchaseSelect
        record={record}
        onOk={async (selectedValue, record) => {
          try {
            await convertEBookToBook({ ...record, media: selectedValue })
            setBooks(books.filter((book) => book.isbn !== record.isbn))
            message.success(`${record.title} successfully converted to a book`)
          } catch (error) {
            message.error(error.message)
          } finally {
            hideModal()
          }
        }}
      />
    ), { onCancel: hideModal })
  }

  const columns = [
    { title: 'ISBN', dataIndex: 'isbn', key: 'isbn', sorter: (a, b) => a.isbn - b.isbn, hidden: true },
    { title: 'Title', dataIndex: 'title', key: 'title', sorter: (a, b) => a.title.localeCompare(b.title), sortDirections: ['ascend'] },
    { title: 'Author', dataIndex: 'author', key: 'author', sorter: (a, b) => a.author.localeCompare(b.author), sortDirections: ['ascend'] },
    { title: 'Remove', dataIndex: 'buy', key: 'buy', sorter: (a, b) => a.read - b.read, sortDirections: ['descend'],
      render: (_, record) => (
        <ToggleIcon
          initialValue={record.buy}
          isInteractive={true}
          trueIcon={MinusOutlined}
          falseIcon={PlusOutlined}
          height={16}
          color={config.website.theme.textBase}
          onToggle={(newValue) => handleValueChange(record.isbn, newValue, 'buy')}
        />
      ) },
    { title: 'Purchased', key: 'action',
      render: (_, record) => (
        <Button type="primary" shape="circle" icon={<DollarOutlined />} onClick={() => handlePurchase(record)} />
      ) },
  ]

  return (
    <>
      <Input
        placeholder="Search by title, ISBN, or author"
        size="large"
        allowClear
        prefix={<SearchOutlined />}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{ width: 300 }}
      />
      <Table
        rowKey="isbn"
        columns={columns}
        dataSource={filteredBooks}
        pagination={{ pageSize: 10 }}
        style={{ userSelect: 'none' }}
      />
    </>
  )
}

export default BuyList
