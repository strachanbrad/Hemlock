/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Descriptions, Image, Layout } from 'antd'
import { CheckOutlined, CloseOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons'
import ToggleIcon from './ToggleIcon.jsx'
import Rating from './Rating.jsx'
import { useBookDetail } from './BookDetailContext.jsx'
import config from '../config/config.json'
import { FilledChili, FilledStar, FilledKnife, UnfilledChili, UnfilledStar, UnfilledKnife } from '../images/index.js'

const { Header, Sider, Content } = Layout

const imageContainerStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100%',
}

const BookDetailReadonly = ({ headerStyle, siderStyle }) => {
  const { bookRecord, authors } = useBookDetail()
  const author = authors.find((author) => author.author_id === bookRecord.author_id)

  const items = [
    { key: 'first_name', label: "Author's First Name", span: 2, children: author?.first_name },
    { key: 'last_name', label: "Author's Last Name", span: 2, children: author?.last_name },
    { key: 'media', label: 'Media', span: bookRecord.type === 'EBooks' ? 2 : 3, children: bookRecord.media },
    ...(bookRecord.type === 'EBooks' ? [{
      key: 'buy',
      label: 'Buy',
      span: 1,
      children: (
        <ToggleIcon
          initialValue={bookRecord.buy}
          isInteractive={false}
          trueIcon={MinusOutlined}
          falseIcon={PlusOutlined}
          height={20}
        />
      ),
    }] : []),
    {
      key: 'read',
      label: 'Read',
      span: 1,
      children: (
        <ToggleIcon
          initialValue={bookRecord.read}
          isInteractive={false}
          trueIcon={CheckOutlined}
          falseIcon={CloseOutlined}
          height={20}
        />
      ),
    },
    {
      key: 'star_rating',
      label: 'Star Rating',
      span: 2,
      children: (
        <Rating
          initialRating={bookRecord.star_rating}
          isInteractive={false}
          filledSVG={FilledStar}
          unfilledSVG={UnfilledStar}
          height={20}
          color={config.website.theme.textBase}
        />
      ),
    },
    {
      key: 'spice_rating',
      label: 'Spice Rating',
      span: 1,
      children: (
        <Rating
          initialRating={bookRecord.spice_rating}
          isInteractive={false}
          filledSVG={FilledChili}
          unfilledSVG={UnfilledChili}
          height={20}
          color={config.website.theme.textBase}
        />
      ),
    },
    {
      key: 'gore_rating',
      label: 'Gore Rating',
      span: 1,
      children: (
        <Rating
          initialRating={bookRecord.gore_rating}
          isInteractive={false}
          filledSVG={FilledKnife}
          unfilledSVG={UnfilledKnife}
          height={20}
          color={config.website.theme.textBase}
        />
      ),
    },
    { key: 'synopsis', label: 'Synopsis', span: 4, children: bookRecord.synopsis },
  ]

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
        <Content style={{ marginBottom: 25 }}>
          <Descriptions bordered column={4} items={items} />
        </Content>
      </Layout>
    </Layout>
  )
}

export default BookDetailReadonly
