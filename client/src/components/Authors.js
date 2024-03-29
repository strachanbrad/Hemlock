import React, { useEffect, useState } from 'react';
import { Button, Table, Input } from 'antd';
import { PlusOutlined, MinusOutlined, CheckOutlined, CloseOutlined, SearchOutlined } from '@ant-design/icons';
import { useBookDetail } from './BookDetailContext';
import Rating from './Rating'
import ToggleIcon from './ToggleIcon'
import config from '../config/config'
import { fetchAuthors, fetchBooksByAuthor, updateBookDetail } from '../js/api'
import { FilledStar, FilledChili, FilledKnife, BookOpen, BookClosed, UnfilledStar, UnfilledChili, UnfilledKnife} from '../images'

const Authors = () => {
  const [authors, setAuthors] = useState([]);
  const [books, setBooks] = useState({});
  const [reload, setReload] = useState(true);
  const [eBooks, setEBooks] = useState({});
  const [filteredAuthors, setFilteredAuthors] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [includeEBooks, setIncludeEBooks] = useState(false);
  const { showBookDetailModal } = useBookDetail();

  // Fetch authors from the API
  useEffect(() => {
    fetchAuthors(setAuthors);
  }, [reload]);

  // Fetch books and optionally eBooks based on includeEBooks state
  useEffect(() => {
    if (authors.length > 0) {
      fetchBooksByAuthor(authors, setBooks, 'Books');
      if (includeEBooks) {
        fetchBooksByAuthor(authors, setEBooks, 'EBooks');
      } else {
        setEBooks({});
      }
    }
  }, [authors, includeEBooks]);

  // Update filteredAuthors based on search term
  useEffect(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    const filteredData = authors.filter(({ first_name, last_name }) => {
      return first_name.toLowerCase().includes(lowercasedFilter) || last_name.toLowerCase().includes(lowercasedFilter);
    });
    setFilteredAuthors(filteredData);
  }, [searchTerm, authors]);

  const handleValueChange = async (authorId, isbn, newRating, field, bookType) => {
    await updateBookDetail(isbn, {[field]: newRating}, bookType, null);

    const updateBookData = (data) => {
      return data.map(book => {
        if (book.isbn === isbn) {
          return { ...book, [field]: newRating };
        }
        return book;
      });
    };

    if (books[authorId]?.find(book => book.isbn === isbn)) {
      setBooks(prevBooks => ({
        ...prevBooks,
        [authorId]: updateBookData(prevBooks[authorId])
      }));
    } else if (eBooks[authorId]?.find(eBook => eBook.isbn === isbn)) {
      setEBooks(prevEBooks => ({
        ...prevEBooks,
        [authorId]: updateBookData(prevEBooks[authorId])
      }));
    }
  };

  const expandedRowRender = (authorId, idx) => {
    const combinedData = [...(books[authorId] || []), ...(includeEBooks ? eBooks[authorId] || [] : [])];
    const columns = [
      { title: 'ISBN', dataIndex: 'isbn', key: `isbn-${idx}`, sorter: (a, b) => a.isbn - b.isbn, sortDirections: ['ascend', 'descend', 'ascend'], hidden: true },
      { title: 'Title', dataIndex: 'title', key: `title-${idx}`, sorter: (a, b) => { return a.title.localeCompare(b.title) }, sortDirections: ['ascend'] },
      { title: 'Media', dataIndex: 'media', key: `media-${idx}`, sorter: (a, b) => { return a.media.localeCompare(b.media) }, sortDirections: ['ascend'] },
      { title: 'Read', dataIndex: 'read', key: `read-${idx}`, sorter: (a, b) => a.read - b.read, sortDirections: ['ascend', 'descend', 'ascend'], 
        render: (_, record) => (
          <ToggleIcon
            initialValue={record.read}
            isInteractive={true}
            trueIcon={CheckOutlined}
            falseIcon={CloseOutlined}
            height={16}
            onToggle={(newValue) => handleValueChange(authorId, record.isbn, newValue, 'read', record.type)}
          />
      )},
      { title: 'Stars', dataIndex: 'star_rating', key: `star_rating-${idx}`, sorter: (a, b) => a.star_rating - b.star_rating, sortDirections: ['ascend', 'descend', 'ascend'],
        render: (_, record) => (
          <Rating
            initialRating={record.star_rating}
            isInteractive={true}
            filledSVG={FilledStar}
            unfilledSVG={UnfilledStar}
            height={16}
            color={config.website.theme.textBase}
            onRatingChange={(newRating) => handleValueChange(authorId, record.isbn, newRating, 'star_rating', record.type)}
        />
      )},
      { title: 'Spice', dataIndex: 'spice_rating', key: `spice_rating-${idx}`, sorter: (a, b) => a.spice_rating - b.spice_rating, sortDirections: ['ascend', 'descend', 'ascend'],
        render: (_, record) => (
          <Rating
            initialRating={record.spice_rating}
            isInteractive={true}
            filledSVG={FilledChili}
            unfilledSVG={UnfilledChili}
            height={16}
            color={config.website.theme.textBase}
            onRatingChange={(newRating) => handleValueChange(authorId, record.isbn, newRating, 'spice_rating', record.type)}
        />
      )},
      { title: 'Gore', dataIndex: 'gore_rating', key: `gore_rating-${idx}`, sorter: (a, b) => a.gore_rating - b.gore_rating, sortDirections: ['ascend', 'descend', 'ascend'],
        render: (_, record) => (
          <Rating
            initialRating={record.gore_rating}
            isInteractive={true}
            filledSVG={FilledKnife}
            unfilledSVG={UnfilledKnife}
            height={16}
            color={config.website.theme.textBase}
            onRatingChange={(newRating) => handleValueChange(authorId, record.isbn, newRating, 'gore_rating', record.type)}
        />
      )},
    ];

    return <Table 
      columns={columns} 
      key={`table-${authorId}`} 
      rowKey={(record) => {return record.isbn}} 
      dataSource={combinedData} 
      pagination={false} 
      onRow={(record, index) => {
        return {
          onDoubleClick: () => showBookDetailModal(record, authors, () => setReload(reload => !reload)),
        };
      }}
      style={{userSelect: 'none'}}
    />
  };

  const toggleEBooks = () => setIncludeEBooks(!includeEBooks);

  const columns = [
      { title: 'First Name', dataIndex: 'first_name', key: 'first_name', sorter: (a, b, sortOrder) => { return a.first_name.localeCompare(b.first_name) }, sortDirections: ['ascend'] },
      { title: 'Last Name', dataIndex: 'last_name', key: 'last_name', sorter: (a, b, sortOrder) => { return a.last_name.localeCompare(b.last_name) }, sortDirections: ['ascend'] }, 
  ];

  return (
    <>
      <Input
        placeholder="Search by first or last name"
        size='large'
        allowClear={true}
        prefix={<SearchOutlined/>}
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        style={{ width: 300 }}
      />
      <Button onClick={toggleEBooks} style={{float: 'right'}} icon={includeEBooks ? <MinusOutlined /> : <PlusOutlined />}>
        {includeEBooks ? 'Exclude EBooks' : 'Include EBooks'}
      </Button>
      <Table
        key='rootTable'
        rowKey="author_id"
        columns={columns}
        dataSource={filteredAuthors}
        expandable={{
          expandedRowRender: (record, idx) => expandedRowRender(record.author_id, idx),
          rowExpandable: record => books[record.author_id]?.length > 0 || includeEBooks,
          expandIcon: ({ expanded, onExpand, record }) =>
            expanded ? (
              <BookOpen onClick={e => onExpand(record, e)} style={{ cursor: 'pointer', fill: config.website.theme.textBase, height: 'auto', width: '16px' }} />
            ) : (
              <BookClosed onClick={e => onExpand(record, e)} style={{ cursor: 'pointer', fill: config.website.theme.textBase, height: 'auto', width: '16px' }} />
            )
        }}
      />
    </>
  );
};

export default Authors;
