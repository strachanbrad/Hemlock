/*BookDetailEdit.js
 *
 * Copyright (c) 2023 Hemlock
 * Author: Bradly Strachan
 * 
 * This file is part of Hemlock, which is released under the GNU General Public License v3.0.
 * See the file LICENSE in this distribution for more information.
 */

import React, { useState, useEffect } from 'react';
import { Form, Input, Layout, Upload, Descriptions, Select } from 'antd';
import AuthorSelector from './AuthorSelector';
import Rating from './Rating';
import ToggleIcon from './ToggleIcon';
import { useBookDetail } from './BookDetailContext';
import config from '../config/config.json';
import { updateBookDetail } from '../js/api'
import { CheckOutlined, CloseOutlined, InboxOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';
import { FilledChili, FilledStar, FilledKnife, UnfilledChili, UnfilledStar, UnfilledKnife } from '../images'; // Adjust imports based on your file structure

const { Header, Sider, Content } = Layout;

const BookDetailEdit = ({ headerStyle, siderStyle, form }) => {
  const {bookRecord, setBookRecord, authors, setAuthors, isEditable} = useBookDetail();

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
      });
    }
  }, [isEditable]);

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
    height: '100%' 
  }

  const [uploadedFile, setUploadedFile] = useState(null);
  
  const onUploadChange = info => {
    const file = info.fileList.length > 0 ? info.fileList[0] : null;
    setUploadedFile(file);
  };
  
  const onFinish = async (values) => {
    updateBookDetail(bookRecord.isbn, values, bookRecord.type, uploadedFile)
    setBookRecord({ ...bookRecord, ...values });
  };

  const updateBookRecord = (field) => {
    form.setFieldsValue(field)
    setBookRecord({ ...bookRecord, ...field });
  };

  // Define how to update form values when child components change
  const handleAuthorChange = newAuthorId => updateBookRecord({ author_id: newAuthorId });
  const handleStarRatingChange = newRating => updateBookRecord({ star_rating: newRating });
  const handleSpiceRatingChange = newRating => updateBookRecord({ spice_rating: newRating });
  const handleGoreRatingChange = newRating => updateBookRecord({ gore_rating: newRating });
  const handleReadToggle = newRead => updateBookRecord({ read: newRead });
  const handleBuyToggle = newBuy => updateBookRecord({ buy: newBuy });

  const getOptions = (bookType) => {
    if (bookType === 'Books'){
      return [
        { value: 'Hardcover', label: 'Hardcover' },
        { value: 'Paperback', label: 'Paperback' },
      ]
    }
    return [
      { value: 'EBook', label: 'EBook' },
    ]

  };

  return (
    <Form onFinish={onFinish} form={form} layout="vertical">
      <Layout>
        <Header style={headerStyle}>
          <span style={{ float: 'right' }}>{bookRecord.isbn}</span>
          <Form.Item name="title" initialValue={bookRecord.title} rules={[{ required: true, message: 'Please enter a title' }]} style={verticalAlign}>
            <Input variant='borderless' style={headerInputStyle} />
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
          <Content style={{marginBottom: 25}}>
              <Descriptions bordered column={4}>
                <Descriptions.Item label="Author" span={4}>
                  <Form.Item
                    name="author_id"
                    rules={[{ required: true, message: 'Please select an author' }]}
                    initialValue={bookRecord.author_id}
                    style={{margin: 0}}
                  >
                    <AuthorSelector
                      authors={authors}
                      variant='borderless'
                      currentAuthorId={bookRecord.author_id}
                      onAuthorChange={handleAuthorChange}
                      onNewAuthor={(newAuthor) => {
                        setAuthors([...authors, newAuthor]);
                      }}
                    />
                  </Form.Item>
                </Descriptions.Item>

                <Descriptions.Item label="Media" span={bookRecord.type === 'EBooks' ? 2 : 3}>
                  <Form.Item
                    name="media"
                    initialValue={bookRecord.media}
                    rules={[{ required: true, message: 'Please select a media' }]}
                    style={{margin: 0}}
                  >
                    <Select
                      variant='borderless'
                      options={getOptions(bookRecord.type)}
                    />
                  </Form.Item>
                </Descriptions.Item>

                { bookRecord.type === 'EBooks' && (
                  <Descriptions.Item label="Buy" span={1}>
                    <Form.Item
                      name="buy"
                      valuePropName="checked"
                      initialValue={bookRecord.buy}
                      rules={[{ required: true, message: 'Please indicate buy status' }]}
                      style={{margin: 0}}
                    >
                      <ToggleIcon
                        initialValue={bookRecord.buy}
                        isInteractive={true}
                        trueIcon={MinusOutlined}
                        falseIcon={PlusOutlined}
                        height={16}
                        onToggle={handleBuyToggle}
                      />
                    </Form.Item>
                  </Descriptions.Item>
                )}
          
                <Descriptions.Item label="Read" span={1}>
                  <Form.Item
                    name="read"
                    valuePropName="checked"
                    initialValue={bookRecord.read}
                    rules={[{ required: true, message: 'Please indicate read status' }]}
                    style={{margin: 0}}
                  >
                    <ToggleIcon
                      initialValue={bookRecord.read}
                      isInteractive={true}
                      trueIcon={CheckOutlined}
                      falseIcon={CloseOutlined}
                      height={16}
                      onToggle={handleReadToggle}
                    />
                  </Form.Item>
                </Descriptions.Item>

                <Descriptions.Item label="Star Rating" span={2}>
                  <Form.Item
                    name="star_rating"
                    rules={[{ required: true, message: 'Please rate the book' }]}
                    initialValue={bookRecord.star_rating}
                    style={{margin: 0}}
                  >
                    <Rating
                      initialRating={bookRecord.star_rating}
                      isInteractive={true}
                      filledSVG={FilledStar}
                      unfilledSVG={UnfilledStar}
                      height={16}
                      color={config.website.theme.textBase}
                      onRatingChange={handleStarRatingChange}
                    />
                  </Form.Item>
                </Descriptions.Item>
          
                <Descriptions.Item label="Spice Rating" span={1}>
                  <Form.Item
                    name="spice_rating"
                    rules={[{ required: true, message: 'Please provide a spice rating' }]}
                    initialValue={bookRecord.spice_rating}
                    style={{margin: 0}}
                  >
                    <Rating
                      initialRating={bookRecord.spice_rating}
                      isInteractive={true}
                      filledSVG={FilledChili}
                      unfilledSVG={UnfilledChili}
                      height={16}
                      color={config.website.theme.textBase}
                      onRatingChange={handleSpiceRatingChange}
                    />
                  </Form.Item>
                </Descriptions.Item>

                <Descriptions.Item label="Gore Rating" span={1}>
                  <Form.Item
                    name="gore_rating"
                    rules={[{ required: true, message: 'Please provide a spice rating' }]}
                    initialValue={bookRecord.gore_rating}
                    style={{margin: 0}}
                  >
                    <Rating
                      initialRating={bookRecord.gore_rating}
                      isInteractive={true}
                      filledSVG={FilledKnife}
                      unfilledSVG={UnfilledKnife}
                      height={16}
                      color={config.website.theme.textBase}
                      onRatingChange={handleGoreRatingChange}
                    />
                  </Form.Item>
                </Descriptions.Item>

                <Descriptions.Item label="Synopsis" span={4}>
                  <Form.Item
                    name="synopsis"
                    initialValue={bookRecord.synopsis}
                    rules={[{ required: true, message: 'Please enter a synopsis' }]}
                    style={{margin: 0}}
                  >
                  <Input.TextArea variant='borderless'/>
                </Form.Item>
              </Descriptions.Item>
            </Descriptions>
          </Content>
        </Layout>
      </Layout>
    </Form>
  );
};

export default BookDetailEdit;
