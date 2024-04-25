/*AuthorSelector.js
 *
 * Copyright (c) 2023 Hemlock
 * Author: Bradly Strachan
 * 
 * This file is part of Hemlock, which is released under the GNU General Public License v3.0.
 * See the file LICENSE in this distribution for more information.
 */

import React, { useState, useEffect } from 'react';
import { Select, Button, Input, Space, message, Popconfirm, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { insertData } from '../js/api'

const AuthorSelector = ({ authors, setAuthors, currentAuthorId, onAuthorChange, onNewAuthor, variant }) => {
  const [isAddingNewAuthor, setIsAddingNewAuthor] = useState(false);
  const [newAuthorFirstName, setNewAuthorFirstName] = useState('');
  const [newAuthorLastName, setNewAuthorLastName] = useState('');
  const [errors, setErrors] = useState({ firstName: '', lastName: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredAuthors, setFilteredAuthors] = useState([]);

  useEffect(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    const filteredData = authors.filter(({ first_name, last_name }) => {
      return first_name.toLowerCase().includes(lowercasedFilter) || last_name.toLowerCase().includes(lowercasedFilter);
    });
    setFilteredAuthors(filteredData);
  }, [searchTerm, authors]);

  const validateFields = () => {
    let isValid = true;
    let errors = {};

    if (!newAuthorFirstName.trim()) {
      errors.firstName = 'First name is required';
      isValid = false;
    }

    if (!newAuthorLastName.trim()) {
      errors.lastName = 'Last name is required';
      isValid = false;
    }

    setErrors(errors);
    return isValid;
  };

  const handleAddNewAuthor = () => {
    const isValid = validateFields();

    if (!isValid) {
      return;
    }

    const newAuthorId = authors.length > 0 ? authors[authors.length - 1].author_id + 1 : 1;
    const newAuthor = {
      author_id: newAuthorId,
      first_name: newAuthorFirstName,
      last_name: newAuthorLastName,
    }

    insertData('Authors', newAuthor, (error, record) => {
      if (error) {
        message.error(`Error inserting new author: ${error}`);
      } else {
        message.success(`${newAuthorFirstName} ${newAuthorLastName} successfully added`);
      }
    })

    onNewAuthor(newAuthor);

    setNewAuthorFirstName('');
    setNewAuthorLastName('');
    setIsAddingNewAuthor(false);
  };

  return (
    <div>
      {!isAddingNewAuthor ? (
        <Select
          value={currentAuthorId}
          onChange={onAuthorChange}
          optionLabelProp="children"
          placeholder="Author"
          allowClear={true}
          variant={variant}
          size="large"
          dropdownRender={menu => (
            <>
              <Input
                placeholder="Search by first or last name"
                allowClear={true}
                prefix={<SearchOutlined/>}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {menu}
              <Button type="dashed" onClick={() => setIsAddingNewAuthor(true)} block>
                Add New Author
              </Button>
            </>
          )}
        >
          {filteredAuthors.map(author => (
            <Select.Option key={author.author_id} value={author.author_id}>{author.first_name} {author.last_name}</Select.Option>
          ))}
        </Select>
      ) : (
        <Space>
          <Space.Compact> 
            <Space.Compact direction="vertical">
              <Input
                placeholder="First Name"
                value={newAuthorFirstName}
                onChange={e => {
                  setNewAuthorFirstName(e.target.value);
                  setErrors(errors => ({ ...errors, firstName: '' }));
                }}
                status={errors.firstName ? 'error' : ''}
              />
              {errors.firstName && <Typography.Text type="danger">{errors.firstName}</Typography.Text>}
            </Space.Compact>
            <Space.Compact direction="vertical">
              <Input
                placeholder="Last Name"
                value={newAuthorLastName}
                onChange={e => {
                  setNewAuthorLastName(e.target.value);
                  setErrors(errors => ({ ...errors, lastName: '' }));
                }}
                status={errors.lastName ? 'error' : ''}
              />
              {errors.lastName && <Typography.Text type="danger">{errors.lastName}</Typography.Text>}
            </Space.Compact>
          </Space.Compact>
          <Popconfirm
            title="Create new Author"
            description={`Are you sure you want to add ${newAuthorFirstName} ${newAuthorLastName}?`}
            onConfirm={handleAddNewAuthor}
          >
            <Button type="primary" >Add Author</Button>
          </Popconfirm>
          <Button type="info" onClick={() => setIsAddingNewAuthor(false)} >Cancel</Button>
        </Space>
      )}
    </div>
  );
};

export default AuthorSelector;
