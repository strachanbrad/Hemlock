/*BookDetailContext.js
 *
 * Copyright (c) 2023 Hemlock
 * Author: Bradly Strachan
 * 
 * This file is part of Hemlock, which is released under the GNU General Public License v3.0.
 * See the file LICENSE in this distribution for more information.
 */

import React, { createContext, useState, useContext, useRef } from 'react';

const BookDetailContext = createContext();

export const useBookDetail = () => useContext(BookDetailContext);

export const BookDetailProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditable, setIsEditable] = useState(false);
  const [bookRecord, setBookRecord] = useState(null);
  const [authors, setAuthors] = useState(null);
  const onCancelRef = useRef(null);

  const showBookDetailModal = (record, authors, onCancel) => {
    setBookRecord(record);
    setAuthors(authors);
    setIsOpen(true);
    setIsEditable(false);
    onCancelRef.current = onCancel;
  };

  const hideBookDetailModal = () => {
    setIsOpen(false);
    if (onCancelRef.current) {
      onCancelRef.current(); // Execute the stored callback
      onCancelRef.current = null; // Clear the ref
    }
  };

  const toggleEdit = () => {
    setIsEditable(current => !current);
  };

  return (
    <BookDetailContext.Provider value={{ showBookDetailModal, hideBookDetailModal, toggleEdit, isOpen, isEditable, bookRecord, setBookRecord, authors, setAuthors }}>
      {children}
    </BookDetailContext.Provider>
  );
};
