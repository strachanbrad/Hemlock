/*
 * Copyright (c) 2023 Hemlock
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { useState, useEffect, useRef } from 'react'
import { Carousel, Typography, Button, Row, Col } from 'antd'
import { fetchAuthors } from '../../api/authors.js'
import { fetchBooks } from '../../api/books.js'

const BookCarousel = () => {
  const [books, setBooks] = useState([])
  const [ebooks, setEbooks] = useState([])
  const [authors, setAuthors] = useState([])
  const [isFullScreen, setIsFullScreen] = useState(false)
  const carouselRef = useRef(null)

  useEffect(() => {
    fetchBooks(setBooks, 'Books')
    fetchBooks(setEbooks, 'EBooks')
    fetchAuthors(setAuthors)

    const handleFullscreenChange = () => setIsFullScreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const mergedBooks = authors.length > 0
    ? [...books, ...ebooks].map((book) => {
        const author = authors.find((author) => author.author_id === book.author_id)
        return { ...book, author: author ? `${author.first_name} ${author.last_name}` : 'Unknown' }
      })
    : []

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      carouselRef.current.requestFullscreen().catch((err) => {
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`)
      })
    } else if (document.exitFullscreen) {
      document.exitFullscreen()
    }
  }

  return (
    <>
      <div style={{ textAlign: 'right' }}>
        <Button onClick={toggleFullScreen}>
          {isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
        </Button>
      </div>
      <div ref={carouselRef} style={{ height: '100%', backgroundColor: '#fff' }}>
        <Carousel key={isFullScreen ? 'fullscreen' : 'normal'} autoplay effect="fade">
          {mergedBooks.map((book) => (
            <div key={book.isbn}>
              <Row align="middle" style={{ padding: 75 }}>
                <Col span={12}>
                  <img
                    src={`/covers/${book.isbn}.jpg`}
                    alt={book.title}
                    style={{ marginLeft: '25%', width: '50%', maxHeight: '80vh', objectFit: 'contain' }}
                  />
                </Col>
                <Col span={12}>
                  <Typography.Title level={1}>{book.title}</Typography.Title>
                  <Typography.Title level={3}>{book.author}</Typography.Title>
                  <Typography.Paragraph>{book.synopsis}</Typography.Paragraph>
                </Col>
              </Row>
            </div>
          ))}
        </Carousel>
      </div>
    </>
  )
}

export default BookCarousel
