import React from 'react';
import { Descriptions, Image, Layout } from 'antd';
import ToggleIcon from './ToggleIcon'
import Rating from './Rating';
import { useBookDetail } from './BookDetailContext';
import config from '../config/config.json';
import { FilledChili, FilledStar, FilledKnife, UnfilledChili, UnfilledStar, UnfilledKnife } from '../images'; // Adjust imports based on your file structure
import { CheckOutlined, CloseOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

const imageContainerStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100%',
};

const BookDetailReadonly = ({ headerStyle, siderStyle }) => {
  const {bookRecord, authors} = useBookDetail();

  return (
    <Layout>
      <Header style={headerStyle}>
        <h1 style={{ float: 'left', margin: 0 }}>
          {bookRecord.title}
        </h1>
        <span style={{ float: 'right' }}>
          {bookRecord.isbn}
        </span>
      </Header>
      <Layout>
        <Sider width="25%" style={siderStyle}>
          <div style={imageContainerStyle}>
            <Image width={200} src={`/covers/${bookRecord.isbn}.jpg`} />
          </div>
        </Sider>
        <Content style={{marginBottom: 25}}>
          <Descriptions bordered column={4}>
            <Descriptions.Item label="Author's First Name" span={2} >
              {authors.find(author => author.author_id === bookRecord.author_id)?.first_name}
            </Descriptions.Item>
            <Descriptions.Item label="Author's Last Name" span={2} >
              {authors.find(author => author.author_id === bookRecord.author_id)?.last_name}
            </Descriptions.Item>

            <Descriptions.Item label="Media" span={bookRecord.type === 'EBooks' ? 2 : 3}>
              {bookRecord.media}
            </Descriptions.Item>

            { bookRecord.type === 'EBooks' && (
              <Descriptions.Item label="Buy" span={1}>
                <ToggleIcon
                  initialValue={bookRecord.buy}
                  isInteractive={false}
                  trueIcon={MinusOutlined}
                  falseIcon={PlusOutlined}
                  height={20}
                />
              </Descriptions.Item>
            )}

            <Descriptions.Item label="Read" span={1} >
              <ToggleIcon
                initialValue={bookRecord.read}
                isInteractive={false}
                trueIcon={CheckOutlined}
                falseIcon={CloseOutlined}
                height={20}
              />
            </Descriptions.Item>
  
            <Descriptions.Item label="Star Rating" span={2} >
              <Rating
                initialRating={bookRecord.star_rating}
                isInteractive={false}
                filledSVG={FilledStar}
                unfilledSVG={UnfilledStar}
                height={20}
                color={config.website.theme.textBase}
              />
            </Descriptions.Item>
    
            <Descriptions.Item label="Spice Rating" span={1} >
              <Rating
                initialRating={bookRecord.spice_rating}
                isInteractive={false}
                filledSVG={FilledChili}
                unfilledSVG={UnfilledChili}
                height={20}
                color={config.website.theme.textBase}
              />
            </Descriptions.Item>
  
            <Descriptions.Item label="Gore Rating" span={1} >
              <Rating
                initialRating={bookRecord.gore_rating}
                isInteractive={false}
                filledSVG={FilledKnife}
                unfilledSVG={UnfilledKnife}
                height={20}
                color={config.website.theme.textBase}
              />
            </Descriptions.Item>
  

            <Descriptions.Item label="Synopsis" span={4}>
              {bookRecord.synopsis}
            </Descriptions.Item>
          </Descriptions>
        </Content>
      </Layout>
    </Layout>
  );
};

export default BookDetailReadonly;
