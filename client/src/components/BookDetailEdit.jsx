/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useState, useEffect } from 'react'
import { Form, Input, Layout, Upload, Descriptions, Select } from 'antd'
import { CheckOutlined, CloseOutlined, InboxOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons'
import AuthorSelector from './AuthorSelector.jsx'
import Rating from './Rating.jsx'
import ToggleIcon from './ToggleIcon.jsx'
import { useBookDetail } from './BookDetailContext.jsx'
import config from '../config/config.json'
import { updateBookDetail } from '../api/books.js'
import { FilledChili, FilledStar, FilledKnife, UnfilledChili, UnfilledStar, UnfilledKnife } from '../images/index.js'

const { Header, Sider, Content } = Layout

const headerInputStyle = {
  display: 'block',
  float: 'left',
  width: 'auto',
  paddingLeft: 0,
  fontSize: '2em',
  marginTop: '0.67em',
  marginBottom: '0.67em',
  marginLeft: 0,
  marginRight: 0,
  fontWeight: 'bold',
}

const verticalAlign = {
  display: 'flex',
  alignItems: 'center',
  height: '100%',
}

const mediaOptions = (bookType) => bookType === 'Books'
  ? [
      { value: 'Hardcover', label: 'Hardcover' },
      { value: 'Paperback', label: 'Paperback' },
    ]
  : [{ value: 'EBook', label: 'EBook' }]

const BookDetailEdit = ({ headerStyle, siderStyle, form }) => {
  const { bookRecord, setBookRecord, authors, setAuthors } = useBookDetail()
  const [uploadedFile, setUploadedFile] = useState(null)

  // The form instance outlives this component, so untouched fields are reset to the record.
  useEffect(() => {
    if (!form.isFieldsTouched()) {
      form.setFieldsValue({
        title: bookRecord.title,
        author_id: bookRecord.author_id,
        media: bookRecord.media,
        read: bookRecord.read,
        star_rating: bookRecord.star_rating,
        spice_rating: bookRecord.spice_rating,
        gore_rating: bookRecord.gore_rating,
        synopsis: bookRecord.synopsis,
      })
    }
  }, [form, bookRecord])

  const onUploadChange = (info) => {
    setUploadedFile(info.fileList.length > 0 ? info.fileList[0] : null)
  }

  const onFinish = async (values) => {
    updateBookDetail(bookRecord.isbn, values, bookRecord.type, uploadedFile)
    setBookRecord({ ...bookRecord, ...values })
  }

  const updateBookRecord = (field) => {
    form.setFieldsValue(field)
    setBookRecord({ ...bookRecord, ...field })
  }

  const items = [
    {
      key: 'author',
      label: 'Author',
      span: 4,
      children: (
        <Form.Item
          name="author_id"
          rules={[{ required: true, message: 'Please select an author' }]}
          initialValue={bookRecord.author_id}
          style={{ margin: 0 }}
        >
          <AuthorSelector
            authors={authors}
            variant="borderless"
            currentAuthorId={bookRecord.author_id}
            onAuthorChange={(author_id) => updateBookRecord({ author_id })}
            onNewAuthor={(newAuthor) => setAuthors([...authors, newAuthor])}
          />
        </Form.Item>
      ),
    },
    {
      key: 'media',
      label: 'Media',
      span: bookRecord.type === 'EBooks' ? 2 : 3,
      children: (
        <Form.Item
          name="media"
          initialValue={bookRecord.media}
          rules={[{ required: true, message: 'Please select a media' }]}
          style={{ margin: 0 }}
        >
          <Select variant="borderless" options={mediaOptions(bookRecord.type)} />
        </Form.Item>
      ),
    },
    ...(bookRecord.type === 'EBooks' ? [{
      key: 'buy',
      label: 'Buy',
      span: 1,
      children: (
        <Form.Item
          name="buy"
          valuePropName="checked"
          initialValue={bookRecord.buy}
          rules={[{ required: true, message: 'Please indicate buy status' }]}
          style={{ margin: 0 }}
        >
          <ToggleIcon
            initialValue={bookRecord.buy}
            isInteractive={true}
            trueIcon={MinusOutlined}
            falseIcon={PlusOutlined}
            height={16}
            onToggle={(buy) => updateBookRecord({ buy })}
          />
        </Form.Item>
      ),
    }] : []),
    {
      key: 'read',
      label: 'Read',
      span: 1,
      children: (
        <Form.Item
          name="read"
          valuePropName="checked"
          initialValue={bookRecord.read}
          rules={[{ required: true, message: 'Please indicate read status' }]}
          style={{ margin: 0 }}
        >
          <ToggleIcon
            initialValue={bookRecord.read}
            isInteractive={true}
            trueIcon={CheckOutlined}
            falseIcon={CloseOutlined}
            height={16}
            onToggle={(read) => updateBookRecord({ read })}
          />
        </Form.Item>
      ),
    },
    {
      key: 'star_rating',
      label: 'Star Rating',
      span: 2,
      children: (
        <Form.Item
          name="star_rating"
          rules={[{ required: true, message: 'Please rate the book' }]}
          initialValue={bookRecord.star_rating}
          style={{ margin: 0 }}
        >
          <Rating
            initialRating={bookRecord.star_rating}
            isInteractive={true}
            filledSVG={FilledStar}
            unfilledSVG={UnfilledStar}
            height={16}
            color={config.website.theme.textBase}
            onRatingChange={(star_rating) => updateBookRecord({ star_rating })}
          />
        </Form.Item>
      ),
    },
    {
      key: 'spice_rating',
      label: 'Spice Rating',
      span: 1,
      children: (
        <Form.Item
          name="spice_rating"
          rules={[{ required: true, message: 'Please provide a spice rating' }]}
          initialValue={bookRecord.spice_rating}
          style={{ margin: 0 }}
        >
          <Rating
            initialRating={bookRecord.spice_rating}
            isInteractive={true}
            filledSVG={FilledChili}
            unfilledSVG={UnfilledChili}
            height={16}
            color={config.website.theme.textBase}
            onRatingChange={(spice_rating) => updateBookRecord({ spice_rating })}
          />
        </Form.Item>
      ),
    },
    {
      key: 'gore_rating',
      label: 'Gore Rating',
      span: 1,
      children: (
        <Form.Item
          name="gore_rating"
          rules={[{ required: true, message: 'Please provide a gore rating' }]}
          initialValue={bookRecord.gore_rating}
          style={{ margin: 0 }}
        >
          <Rating
            initialRating={bookRecord.gore_rating}
            isInteractive={true}
            filledSVG={FilledKnife}
            unfilledSVG={UnfilledKnife}
            height={16}
            color={config.website.theme.textBase}
            onRatingChange={(gore_rating) => updateBookRecord({ gore_rating })}
          />
        </Form.Item>
      ),
    },
    {
      key: 'synopsis',
      label: 'Synopsis',
      span: 4,
      children: (
        <Form.Item
          name="synopsis"
          initialValue={bookRecord.synopsis}
          rules={[{ required: true, message: 'Please enter a synopsis' }]}
          style={{ margin: 0 }}
        >
          <Input.TextArea variant="borderless" />
        </Form.Item>
      ),
    },
  ]

  return (
    <Form onFinish={onFinish} form={form} layout="vertical">
      <Layout>
        <Header style={headerStyle}>
          <span style={{ float: 'right' }}>{bookRecord.isbn}</span>
          <Form.Item name="title" initialValue={bookRecord.title} rules={[{ required: true, message: 'Please enter a title' }]} style={verticalAlign}>
            <Input variant="borderless" style={headerInputStyle} />
          </Form.Item>
        </Header>
        <Layout>
          <Sider width="25%" style={siderStyle}>
            <Upload.Dragger
              name="cover"
              multiple={false}
              maxCount={1}
              beforeUpload={() => false}
              onChange={onUploadChange}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag file to this area to upload</p>
            </Upload.Dragger>
          </Sider>
          <Content style={{ marginBottom: 25 }}>
            <Descriptions bordered column={4} items={items} />
          </Content>
        </Layout>
      </Layout>
    </Form>
  )
}

export default BookDetailEdit
