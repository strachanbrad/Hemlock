import React, { useState, useEffect } from 'react';
import { Form, Input, Layout, Space, Upload, Descriptions, Select, Button, message, Typography } from 'antd';
import { fetchAuthors, insertBookDetail } from '../js/api'
import AuthorSelector from './AuthorSelector';
import Rating from './Rating';
import ToggleIcon from './ToggleIcon';
import config from '../config/config.json';
import { CheckOutlined, CloseOutlined, InboxOutlined } from '@ant-design/icons';
import { FilledChili, FilledStar, FilledKnife, UnfilledChili, UnfilledStar, UnfilledKnife } from '../images';

const { Header, Sider, Content } = Layout;
const { Title } = Typography

const AddBooks = () => {
  const [form] = Form.useForm();
  const [authors, setAuthors] = useState([]);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [mediaType, setMediaType] = useState('');

  useEffect(() => {
    fetchAuthors(setAuthors);
  }, []);

  const onUploadChange = info => {
    const file = info.fileList.length > 0 ? info.fileList[0] : null;
    setUploadedFile(file);
  };

  const parseISBN = (value) => {
    // Remove any character that is not a digit or an X (for ISBN-10)
    if(!value) return ''
    return value.toUpperCase().replace(/[^0-9X]/g, '');
  };

  const isValidISBN10 = (isbn) => {
    const regex = /^(?:\d{9}[\dX])$/;
    if (!regex.test(isbn)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += (10 - i) * parseInt(isbn.charAt(i), 10);
    }
    sum += isbn.charAt(9).toUpperCase() === 'X' ? 10 : parseInt(isbn.charAt(9), 10);

    return sum % 11 === 0;
  };

  const isValidISBN13 = (isbn) => {
    const regex = /^(?:\d{13})$/;
    if (!regex.test(isbn)) return false;

    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += (i % 2 === 0 ? 1 : 3) * parseInt(isbn.charAt(i), 10);
    }

    const checkDigit = 10 - (sum % 10);
    return parseInt(isbn.charAt(12), 10) === (checkDigit === 10 ? 0 : checkDigit);
  };

  const onFinish = async (values) => {
    const bookType = (values.media === 'EBook' && values.media) ? 'EBooks' : 'Books'

    try{
      const isbnValue = parseISBN(values.isbn);
      insertBookDetail(isbnValue, values, bookType, uploadedFile)
      form.resetFields();
      message.success(`Successfully added ${values.title} to ${bookType.substring(0, bookType.length - 1)}`)
    } catch(error) {
      console.log(error)
      message.error(`${bookType.substring(0, bookType.length - 1)} Not Added: ${error}`)
    }
  };

  const onMediaChange = value => {
    setMediaType(value);
    form.setFieldsValue({ media: value });
  };

  const onReset = () => {
    form.resetFields();
  };

  //TODO ISBN Fetch feature (Downloading the image is the issue)
  //const simulateUploadChange = (fileObject) => {
  //  onUploadChange({
  //    file: fileObject,
  //    fileList: [fileObject],
  //  });
  //};

  //const handleFetchBookDetails = async () => {
  //  try {
  //    const isbn = form.getFieldsValue().isbn
  //    if(!isValidISBN13(isbn)){
  //      throw new Error('Not a valid ISBN')
  //    }

  //    const bookDetails = await fetchBookDetailsFromISBNdb(isbn, authors);
  //    if (bookDetails.cover) {
  //      const fileName = `${isbn}.jpg`; // Construct filename, could be more specific or dynamic
  //      const fileObject = new File([bookDetails.cover], fileName, {
  //        type: bookDetails.cover.type,
  //      });
  //      simulateUploadChange(fileObject);
  //    }

  //    form.setFieldsValue({isbn: bookDetails.isbn})
  //    form.setFieldsValue({title: bookDetails.title})
  //    form.setFieldsValue({author_id: bookDetails.author_id})
  //    form.setFieldsValue({synopsis: bookDetails.synopsis})
  //  } catch (error) {
  //    console.error('Error fetching book details:', error);
  //    message.error('Failed to fetch book details');
  //  }
  //};

  const verticalAlign = {
    display: 'flex', 
    alignItems: 'center', 
    height: '100%' 
  }

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
              listType='picture' 
              beforeUpload={() => false} 
              onChange={onUploadChange}
              style={{maxHeight: '75%'}}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag a cover image to this area to upload</p>
            </Upload.Dragger>
          </Sider>
          <Content>
            <Descriptions bordered >
              <Descriptions.Item label="ISBN" span={3}>
                <Form.Item
                  name="isbn"
                  style={{margin: 0}}
                  rules={[
                    { required: true, message: 'Please input the ISBN!' },
                    () => ({
                      validator(_, value) {
                        const isbnValue = parseISBN(value);
                        if (!value || (isbnValue.length === 10 && isValidISBN10(isbnValue)) || 
                            (isbnValue.length === 13 && isValidISBN13(isbnValue))) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('Please enter a valid ISBN'));
                      },
                    }),
                  ]}
                >
                  <Input placeholder="ISBN" size='large' />
                </Form.Item>
              </Descriptions.Item>

              <Descriptions.Item label="Title" span={3}>
                <Form.Item name="title" rules={[{ required: true, message: 'Please enter a title' }]} style={{margin: 0}}>
                  <Input placeholder="Book Title" size='large' />
                </Form.Item>
              </Descriptions.Item>

              <Descriptions.Item label="Author" span={3}>
                <Form.Item name="author_id" rules={[{ required: true, message: 'Please select an author' }]} style={{margin: 0}}>
                  <AuthorSelector 
                    authors={authors} 
                    onAuthorChange={value => form.setFieldsValue({ author_id: value })} 
                    onNewAuthor={(newAuthor) => { setAuthors([...authors, newAuthor]) }}
                  />
                </Form.Item>
              </Descriptions.Item>

              <Descriptions.Item label="Media" span={mediaType === 'EBook' ? 2 : 3} >
                <Form.Item name="media" rules={[{ required: true, message: 'Please select a media type' }]} style={{margin: 0}}>
                  <Select onChange={onMediaChange} placeholder="Select Media Type" size="large">
                    <Select.Option value="Hardcover">Hardcover</Select.Option>
                    <Select.Option value="Paperback">Paperback</Select.Option>
                    <Select.Option value="EBook">EBook</Select.Option>
                  </Select>
                </Form.Item>
              </Descriptions.Item>

              {mediaType === 'EBook' && (
                <Descriptions.Item label="Buy" span={1}>
                  <Form.Item name="buy" valuePropName="checked" initialValue={0} style={{margin:0}}>
                    <ToggleIcon 
                      isInteractive={true} 
                      trueIcon={CheckOutlined} 
                      falseIcon={CloseOutlined} 
                      style={{margin: 0}} 
                      height={18}
                      onToggle={value => form.setFieldsValue({ buy: value })}
                    />
                  </Form.Item>
                </Descriptions.Item>
              )}

              <Descriptions.Item label="Star Rating" span={1}>
                <Form.Item name="star_rating" initialValue={0} style={{margin: 0}}>
                  <Rating
                    isInteractive={true}
                    filledSVG={FilledStar}
                    unfilledSVG={UnfilledStar}
                    height={18}
                    color={config.website.theme.textBase}
                    onRatingChange={value => form.setFieldsValue({ star_rating: value })}
                  />
                </Form.Item>
              </Descriptions.Item>
          
              <Descriptions.Item label="Spice Rating" span={1}>
                <Form.Item name="spice_rating" initialValue={0} style={{margin: 0}}>
                  <Rating
                    isInteractive={true}
                    filledSVG={FilledChili}
                    unfilledSVG={UnfilledChili}
                    height={18}
                    color={config.website.theme.textBase}
                    onRatingChange={value => form.setFieldsValue({ spice_rating: value })}
                  />
                </Form.Item>
              </Descriptions.Item>

              <Descriptions.Item label="Gore Rating" span={1}>
                <Form.Item name="gore_rating" initialValue={0} style={{margin: 0}}>
                  <Rating
                    isInteractive={true}
                    filledSVG={FilledKnife}
                    unfilledSVG={UnfilledKnife}
                    height={18}
                    color={config.website.theme.textBase}
                    onRatingChange={value => form.setFieldsValue({ gore_rating: value })}
                  />
                </Form.Item>
              </Descriptions.Item>

              <Descriptions.Item label="Synopsis" span={3}>
                <Form.Item name="synopsis" rules={[{ required: true, message: 'Please enter a synopsis' }]} style={{margin: 0}}>
                  <Input.TextArea placeholder="Enter synopsis here" size="large" />
                </Form.Item>
              </Descriptions.Item>
            </Descriptions>

            <Space.Compact style={{float: 'right', padding: 10}}>
              <Button type="primary" htmlType="submit">Submit</Button>
              <Button onClick={onReset}>Clear</Button>
            </Space.Compact>
              {/*TODO ISBN Fetch feature (Downloading the image is the issue)
              //<Button type="primary" onClick={handleFetchBookDetails} style={{margin: 10}}>Scrape</Button>
              */}
          </Content>
        </Layout>
      </Layout>
    </Form>
  );
};

export default AddBooks;
