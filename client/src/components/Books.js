/*Books.js
 *
 * Copyright (c) 2023 Hemlock
 * Author: Bradly Strachan
 * 
 * This file is part of Hemlock, which is released under the GNU General Public License v3.0.
 * See the file LICENSE in this distribution for more information.
 */

import React, { useEffect, useState } from 'react';
import { Table, Input } from 'antd';
import { CheckOutlined, CloseOutlined, SearchOutlined, PlusOutlined, MinusOutlined  } from '@ant-design/icons';
import { useBookDetail } from './BookDetailContext';
import Rating from './Rating';
import ToggleIcon from './ToggleIcon';
import config from '../config/config';
import { fetchBooks, fetchAuthors, updateBookDetail } from '../js/api';
import { FilledStar, FilledChili, FilledKnife, UnfilledStar, UnfilledChili, UnfilledKnife } from '../images';

const Books = ({bookType}) => {
  const [books, setBooks] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [reload, setReload] = useState(true);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [mergedBooks, setMergedBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const { showBookDetailModal } = useBookDetail();

  useEffect(() => {
    fetchBooks(setBooks, bookType);
    fetchAuthors(setAuthors);
  }, [bookType, reload]); 

  useEffect(() => {
    if (authors.length > 0 && books.length > 0) {
      const updatedBooks = books.map(book => {
        const author = authors.find(author => author.author_id === book.author_id);
        const authorName = author ? `${author.first_name} ${author.last_name}` : 'Unknown';
        return { ...book, author: authorName };
      });
      setMergedBooks(updatedBooks); // Now setting mergedBooks, not books
    }
  }, [authors, books]); // Depends on authors and books, but not on mergedBooks

  useEffect(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    const filteredData = mergedBooks.filter(book => {
      return book.title.toLowerCase().includes(lowercasedFilter) ||
             book.isbn.toString().includes(lowercasedFilter) ||
             book.author.toLowerCase().includes(lowercasedFilter);
    });
    setFilteredBooks(filteredData);
  }, [searchTerm, mergedBooks]);

  const handleValueChange = async (isbn, newRating, field) => {
    await updateBookDetail(isbn, {[field]: newRating}, bookType, null);

    const updateBookData = (data) => {
      return data.map(book => {
        if (book.isbn === isbn) {
          return { ...book, [field]: newRating };
        }
        return book;
      });
    };

    setBooks(updateBookData(books));
  };

const getColumns = (bookType) => {
  let columns = [
    { title: 'ISBN', dataIndex: 'isbn', key: 'isbn', sorter: (a, b) => a.isbn - b.isbn, hidden: true },
    { title: 'Title', dataIndex: 'title', key: 'title', sorter: (a, b) => a.title.localeCompare(b.title), sortDirections: ['ascend'] },
    { title: 'Author', dataIndex: 'author', key: 'author', sorter: (a, b) => a.author.localeCompare(b.author), sortDirections: ['ascend'] },
    { title: 'Read', dataIndex: 'read', key: 'read', sorter: (a, b) => a.read - b.read, sortDirections: ['descend'],
      render: (_, record) => (
        <ToggleIcon
          initialValue={record.read}
          isInteractive={true}
          trueIcon={CheckOutlined}
          falseIcon={CloseOutlined}
          height={16}
          color={config.website.theme.textBase}
          onToggle={(newValue) => handleValueChange(record.isbn, newValue, 'read')}
        />
      )},
    { title: 'Stars', dataIndex: 'star_rating', key: 'star_rating', sortDirections: ['descend'],
      sorter: {
        compare: (a, b) => a.star_rating - b.star_rating,
        multiple: 2,
      },
      render: (_, record) => (
        <Rating
          initialRating={record.star_rating}
          isInteractive={true}
          filledSVG={FilledStar}
          unfilledSVG={UnfilledStar}
          height={16}
          color={config.website.theme.textBase}
          onRatingChange={(newRating) => handleValueChange(record.isbn, newRating, 'star_rating')}
        />
      )},
    { title: 'Spice', dataIndex: 'spice_rating', key: 'spice_rating', sortDirections: ['descend'], 
      sorter: {
        compare: (a, b) => a.spice_rating - b.spice_rating,
        multiple: 3,
      },
      render: (_, record) => (
        <Rating
          initialRating={record.spice_rating}
          isInteractive={true}
          filledSVG={FilledChili}
          unfilledSVG={UnfilledChili}
          height={16}
          color={config.website.theme.textBase}
          onRatingChange={(newRating) => handleValueChange(record.isbn, newRating, 'spice_rating')}
        />
      )},
    { title: 'Gore', dataIndex: 'gore_rating', key: 'gore_rating', sortDirections: ['descend'], 
      sorter: {
        compare: (a, b) => a.gore_rating - b.gore_rating,
        multiple: 4,
      },
      render: (_, record) => (
        <Rating
          initialRating={record.gore_rating}
          isInteractive={true}
          filledSVG={FilledKnife}
          unfilledSVG={UnfilledKnife}
          height={16}
          color={config.website.theme.textBase}
          onRatingChange={(newRating) => handleValueChange(record.isbn, newRating, 'gore_rating')}
        />
      )},
  ];

  // Conditionally add the 'Buy' column for Ebooks
  if (bookType === 'EBooks') {
    columns.push({
      title: 'Buy',
      dataIndex: 'buy',
      key: 'buy',
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
      ),
    });
  }

  return columns;
};

  return (
    <>
      <Input
        placeholder="Search by title, ISBN, or author"
        size="large"
        allowClear
        prefix={<SearchOutlined />}
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        style={{ width: 300 }}
      />
      <Table
        rowKey="isbn"
        columns={getColumns(bookType)}
        dataSource={filteredBooks}
        onRow={(record) => ({
          onDoubleClick: () => showBookDetailModal(record, authors, () => setReload([reload => !reload])),
        })}
        pagination={{ pageSize: 10 }}
        style={{ userSelect: 'none' }}
      />
    </>
  );
};

export default Books;
