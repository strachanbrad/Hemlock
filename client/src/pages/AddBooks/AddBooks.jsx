/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useState, useEffect } from 'react'
import { App, Form, Input, Layout, Space, Upload, Descriptions, Select, Button, Typography } from 'antd'
import { CheckOutlined, CloseOutlined, InboxOutlined } from '@ant-design/icons'
import AuthorSelector from '../../components/AuthorSelector.jsx'
import Rating from '../../components/Rating.jsx'
import ToggleIcon from '../../components/ToggleIcon.jsx'
import config from '../../config/config.json'
import { fetchAuthors } from '../../api/authors.js'
import { insertBookDetail } from '../../api/books.js'
import { FilledChili, FilledStar, FilledKnife, UnfilledChili, UnfilledStar, UnfilledKnife } from '../../images/index.js'

const { Header, Sider, Content } = Layout
const { Title } = Typography

const verticalAlign = {
  display: 'flex',
  alignItems: 'center',
  height: '100%',
}

const parseISBN = (value) => {
  if (!value) return ''
  return value.toUpperCase().replace(/[^0-9X]/g, '')
}

const isValidISBN10 = (isbn) => {
  if (!/^(?:\d{9}[\dX])$/.test(isbn)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * parseInt(isbn.charAt(i), 10)
  }
  sum += isbn.charAt(9).toUpperCase() === 'X' ? 10 : parseInt(isbn.charAt(9), 10)

  return sum % 11 === 0
}

const isValidISBN13 = (isbn) => {
  if (!/^(?:\d{13})$/.test(isbn)) return false

  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += (i % 2 === 0 ? 1 : 3) * parseInt(isbn.charAt(i), 10)
  }

  const checkDigit = 10 - (sum % 10)
  return parseInt(isbn.charAt(12), 10) === (checkDigit === 10 ? 0 : checkDigit)
}

const AddBooks = () => {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [authors, setAuthors] = useState([])
  const [uploadedFile, setUploadedFile] = useState(null)
  const [mediaType, setMediaType] = useState('')

  useEffect(() => {
    fetchAuthors(setAuthors)
  }, [])

  const onUploadChange = (info) => {
    setUploadedFile(info.fileList.length > 0 ? info.fileList[0] : null)
  }

  const onFinish = async (values) => {
    const bookType = values.media === 'EBook' ? 'EBooks' : 'Books'
    const label = bookType.substring(0, bookType.length - 1)

    try {
      await insertBookDetail(parseISBN(values.isbn), values, bookType, uploadedFile)
      form.resetFields()
      message.success(`Successfully added ${values.title} to ${label}`)
    } catch (error) {
      console.log(error)
      message.error(`${label} Not Added: ${error.message}`)
    }
  }

  const onMediaChange = (value) => {
    setMediaType(value)
    form.setFieldsValue({ media: value })
  }

  const items = [
    {
      key: 'isbn',
      label: 'ISBN',
      span: 3,
      children: (
        <Form.Item
          name="isbn"
          style={{ margin: 0 }}
          rules={[
            { required: true, message: 'Please input the ISBN!' },
            () => ({
              validator(_, value) {
                const isbnValue = parseISBN(value)
                if (!value || (isbnValue.length === 10 && isValidISBN10(isbnValue)) ||
                    (isbnValue.length === 13 && isValidISBN13(isbnValue))) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error('Please enter a valid ISBN'))
              },
            }),
          ]}
        >
          <Input placeholder="ISBN" size="large" />
        </Form.Item>
      ),
    },
    {
      key: 'title',
      label: 'Title',
      span: 3,
      children: (
        <Form.Item name="title" rules={[{ required: true, message: 'Please enter a title' }]} style={{ margin: 0 }}>
          <Input placeholder="Book Title" size="large" />
        </Form.Item>
      ),
    },
    {
      key: 'author',
      label: 'Author',
      span: 3,
      children: (
        <Form.Item name="author_id" rules={[{ required: true, message: 'Please select an author' }]} style={{ margin: 0 }}>
          <AuthorSelector
            authors={authors}
            onAuthorChange={(value) => form.setFieldsValue({ author_id: value })}
            onNewAuthor={(newAuthor) => setAuthors([...authors, newAuthor])}
          />
        </Form.Item>
      ),
    },
    {
      key: 'media',
      label: 'Media',
      span: mediaType === 'EBook' ? 2 : 3,
      children: (
        <Form.Item name="media" rules={[{ required: true, message: 'Please select a media type' }]} style={{ margin: 0 }}>
          <Select
            onChange={onMediaChange}
            placeholder="Select Media Type"
            size="large"
            options={[
              { value: 'Hardcover', label: 'Hardcover' },
              { value: 'Paperback', label: 'Paperback' },
              { value: 'EBook', label: 'EBook' },
            ]}
          />
        </Form.Item>
      ),
    },
    ...(mediaType === 'EBook' ? [{
      key: 'buy',
      label: 'Buy',
      span: 1,
      children: (
        <Form.Item name="buy" valuePropName="checked" initialValue={0} style={{ margin: 0 }}>
          <ToggleIcon
            isInteractive={true}
            trueIcon={CheckOutlined}
            falseIcon={CloseOutlined}
            style={{ margin: 0 }}
            height={18}
            onToggle={(value) => form.setFieldsValue({ buy: value })}
          />
        </Form.Item>
      ),
    }] : []),
    {
      key: 'star_rating',
      label: 'Star Rating',
      span: 1,
      children: (
        <Form.Item name="star_rating" initialValue={0} style={{ margin: 0 }}>
          <Rating
            isInteractive={true}
            filledSVG={FilledStar}
            unfilledSVG={UnfilledStar}
            height={18}
            color={config.website.theme.textBase}
            onRatingChange={(value) => form.setFieldsValue({ star_rating: value })}
          />
        </Form.Item>
      ),
    },
    {
      key: 'spice_rating',
      label: 'Spice Rating',
      span: 1,
      children: (
        <Form.Item name="spice_rating" initialValue={0} style={{ margin: 0 }}>
          <Rating
            isInteractive={true}
            filledSVG={FilledChili}
            unfilledSVG={UnfilledChili}
            height={18}
            color={config.website.theme.textBase}
            onRatingChange={(value) => form.setFieldsValue({ spice_rating: value })}
          />
        </Form.Item>
      ),
    },
    {
      key: 'gore_rating',
      label: 'Gore Rating',
      span: 1,
      children: (
        <Form.Item name="gore_rating" initialValue={0} style={{ margin: 0 }}>
          <Rating
            isInteractive={true}
            filledSVG={FilledKnife}
            unfilledSVG={UnfilledKnife}
            height={18}
            color={config.website.theme.textBase}
            onRatingChange={(value) => form.setFieldsValue({ gore_rating: value })}
          />
        </Form.Item>
      ),
    },
    {
      key: 'synopsis',
      label: 'Synopsis',
      span: 3,
      children: (
        <Form.Item name="synopsis" rules={[{ required: true, message: 'Please enter a synopsis' }]} style={{ margin: 0 }}>
          <Input.TextArea placeholder="Enter synopsis here" size="large" />
        </Form.Item>
      ),
    },
  ]

  return (
    <Form onFinish={onFinish} form={form} layout="vertical">
      <Layout>
        <Header style={verticalAlign}>
          <Title>Add a new book</Title>
        </Header>
        <Layout>
          <Sider width="25%">
            <Upload.Dragger
              name="cover"
              multiple={false}
              maxCount={1}
              listType="picture"
              beforeUpload={() => false}
              onChange={onUploadChange}
              style={{ maxHeight: '75%' }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag a cover image to this area to upload</p>
            </Upload.Dragger>
          </Sider>
          <Content>
            <Descriptions bordered column={3} items={items} />

            <Space.Compact style={{ float: 'right', padding: 10 }}>
              <Button type="primary" htmlType="submit">Submit</Button>
              <Button onClick={() => form.resetFields()}>Clear</Button>
            </Space.Compact>
          </Content>
        </Layout>
      </Layout>
    </Form>
  )
}

export default AddBooks
