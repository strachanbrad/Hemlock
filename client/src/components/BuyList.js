import React, { useEffect, useState } from 'react';
import { Button, Table, Input, Select, Space, message, Popconfirm } from 'antd';
import { SearchOutlined, PlusOutlined, MinusOutlined, DollarOutlined  } from '@ant-design/icons';
import ToggleIcon from './ToggleIcon';
import { useAlertModal } from './AlertModalContext'
import config from '../config/config';
import { fetchBooks, fetchAuthors, updateBookDetail, convertEBookToBook } from '../js/api';

const Books = () => {
  const [books, setBooks] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [mergedBooks, setMergedBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const { showModal, hideModal } = useAlertModal();
  const bookType = 'EBooks'

  useEffect(() => {
    fetchBooks(setBooks, bookType);
    fetchAuthors(setAuthors);
  }, [bookType]); 

  useEffect(() => {
    if (authors.length > 0 && books.length > 0) {
      const updatedBooks = books
        .map(book => {
          // Find the author and construct the author name
          const author = authors.find(author => author.author_id === book.author_id);
          const authorName = author ? `${author.first_name} ${author.last_name}` : 'Unknown';
          
          // Only include the book if buy is true, else return null
          return book.buy ? { ...book, author: authorName } : null;
        })
        .filter(book => book !== null); // Filter out the books where buy wasn't true (null entries)
    
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

const handlePurchase = (record) => {
  const PurchaseSelect = ({ onOk, onCancel, record }) => {
    const [selectedValue, setSelectedValue] = useState();

    const handleOk = () => {
      if(selectedValue){
        onOk(selectedValue, record);  // Pass the selected value to the onOk handler
      }
    };

    return (
      <Space direction='vertical' style={{ width: '100%' }}>
        <Select
          style={{ width: '100%' }}
          onSelect={setSelectedValue}
          options={[
            { value: 'Hardcover', label: 'Hardcover' },
            { value: 'Paperback', label: 'Paperback' },
          ]}
        />
        <Popconfirm
          title='Confirm Purchase'
          description={`Are you sure you want to transfer ${record.title} to Books?`}
          onConfirm={handleOk}
        >
          <Button type='primary' disabled={!selectedValue} style={{ float: 'right' }}>
            OK
          </Button>
        </Popconfirm>
      </Space>
    );
  };

  showModal('Select a media type', () => 
    <PurchaseSelect record={record} 
      onOk={async (selectedValue, record) => {
        try{
          record.media = selectedValue; 
          await convertEBookToBook(record)
          setBooks(books.filter(book => book.isbn !== record.isbn));
          message.success(`${record.title} successfully converted to a book`);
        } catch (error){
          message.error(error.message);
        } finally{
          hideModal();
        }
      }}
    />, 
    {onCancel: hideModal}
  );
};

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
      )},
    { title: 'Purchased', key: 'action', 
      render: (_, record) => (
        <Button type='primary' shape='circle' icon={<DollarOutlined/>} onClick={() => handlePurchase(record)}/>
      )},
  ];

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
        columns={columns}
        dataSource={filteredBooks}
        pagination={{ pageSize: 10 }}
        style={{ userSelect: 'none' }}
      />
    </>
  );
};

export default Books;
