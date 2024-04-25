/*api.js
 *
 * Copyright (c) 2023 Hemlock
 * Author: Bradly Strachan
 * 
 * This file is part of Hemlock, which is released under the GNU General Public License v3.0.
 * See the file LICENSE in this distribution for more information.
 */

import config from '../config/config.json';

export const fetchAuthors = async (setAuthors) => {
  try {
    const response = await fetch(`/api/authors`);
    if (response.ok) {
      const data = await response.json();
      setAuthors(data.data || []);
    } else {
      console.error('Failed to fetch authors:', response.statusText);
      setAuthors([]);
    }
  } catch (error) {
    console.error('Network error when fetching authors:', error);
    setAuthors([]);
  }
};

export const fetchBooks = async (setBooks, bookType) => {
  try {
    const response = await fetch(`/api/${bookType}/get/`);
    if (response.ok) {
      const data = await response.json();

      const booksWithType = (data.data || []).map(book => ({ ...book, type: bookType }));
      setBooks(booksWithType || []);
    } else {
      console.error(`Failed to fetch books of type ${bookType}:`, response.statusText);
      setBooks([]);
    }
  } catch (error) {
    console.error(`Network error when fetching books of type ${bookType}:`, error);
    setBooks([]);
  }
};

export const insertData = async (table, data) => {
  try {
    const response = await fetch(`/api/data/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseData = await response.json();
    if (!response.ok) {
      throw new Error(responseData.message || 'Failed to insert data');
    }

    return responseData;
  } catch (error) {
    console.error('Error during data insertion:', error);
    throw error;
  }
};

export const deleteData = async (table, id) => {
  try {
    const response = await fetch(`/api/data/${table}/${id}`, {
      method: 'DELETE',
    });

    const responseData = await response.json();
    if (!response.ok) {
      throw new Error(responseData.message || 'Failed to delete data');
    }

    return responseData;
  } catch (error) {
    console.error('Error during data deletion:', error);
    throw error;
  }
};

export const convertEBookToBook = async (ebookData) => {
  try {
    const response = await fetch(`/api/convertEBookToBook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ebookData),
    });

    const responseData = await response.json();
    if (!response.ok) {
      throw new Error(responseData.message || 'Failed to convert EBook to Book');
    }

    return responseData;
  } catch (error) {
    console.error('Error during eBook conversion:', error);
    throw error;
  }
};

export const fetchBooksByAuthor = async (authors, setBooks, bookType) => {
  const booksByAuthor = await Promise.all(authors.map(async (author) => {
    try {
      const response = await fetch(`/api/${bookType}/author/${author.author_id}`);
      if (!response.ok) {
        console.error(`Failed to fetch books for author ${author.author_id}:`, response.statusText);
        return { [author.author_id]: [] };
      }
      const data = await response.json();
      // Add back the type field to each book
      const booksWithType = (data.data || []).map(book => ({ ...book, type: bookType }));
      return { [author.author_id]: booksWithType };
    } catch (error) {
      console.error(`Network error when fetching books for author ${author.author_id}:`, error);
      return { [author.author_id]: [] };
    }
  }));

  // Combine all books into a single object, keyed by author_id
  const combinedBooks = booksByAuthor.reduce((acc, current) => {
    return { ...acc, ...current };
  }, {});

  setBooks(combinedBooks);
};

export const updateBookDetail = async (isbn, updates, bookType, fileMetadata = null) => {
  const formData = new FormData();

  if (fileMetadata && fileMetadata.originFileObj instanceof File) {
    formData.append('cover', fileMetadata.originFileObj);
  }

  Object.keys(updates).forEach(key => {
    formData.append(key, updates[key]);
  });

  try {
    const response = await fetch(`/api/${bookType}/${isbn}/update`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating book detail:', error);
    throw error;
  }
};

export const insertBookDetail = async (isbn, newBookData, bookType, fileMetadata = null) => {
  const formData = new FormData();

  if (fileMetadata && fileMetadata.originFileObj instanceof File) {
    formData.append('cover', fileMetadata.originFileObj);
  }

  Object.keys(newBookData).forEach(key => {
    formData.append(key, newBookData[key]);
  });

  try {
    const response = await fetch(`/api/${bookType}/${isbn}/insert`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
};

//TODO ISBN fetch feature (Downloading the image is the issue)
//export const uploadCoverImage = async (isbn, imageUrl) => {
//  try {
//    const response = await fetch(`/api/downloadCover/${isbn}`, {
//      method: 'POST',
//      headers: {
//        'Content-Type': 'application/json',
//      },
//      body: JSON.stringify({ imageUrl }),
//    });
//
//    if (!response.ok) {
//      throw new Error(`HTTP error! Status: ${response.status}`);
//    }
//
//    return await response.json(); 
//  } catch (error) {
//    console.error('Error uploading cover image', error);
//    throw error; 
//  }
//}
//
//export const fetchBookDetailsFromISBNdb = async (isbn, authors) => {
//  const headers = {
//    "Content-Type": 'application/json',
//    "Authorization": `${config.ISBNDB_API_KEY}`
//  };
//
//  try {
//    const response = await fetch(`https://api2.isbndb.com/book/${isbn}`, { headers: headers });
//
//    if (response.status === 401) throw new Error('Unauthorized, please update API key');
//    if (response.status === 403) throw new Error('Unauthorized, please update API key');
//    if (response.status === 404) throw new Error('Book not found');
//    if (response.status === 429) throw new Error('Too many requests, slow down or check daily limit');
//
//    const data = await response.json();
//
//    if (!data || !data.book) throw new Error('Invalid response from ISBNdb');
//
//    const { title, synopsis, authors: bookAuthors, image, binding } = data.book;
//
//    uploadCoverImage(isbn, image);
//
//    let authorId = null;
//    if (bookAuthors.length > 0) {
//      const [newAuthorFirstName, newAuthorLastName] = bookAuthors[0].split(' ');
//      const existingAuthor = authors.find(author => 
//        author.first_name === newAuthorFirstName && author.last_name === newAuthorLastName
//      );
//
//      if (existingAuthor) {
//        authorId = existingAuthor.author_id;
//      } else {
//        const newAuthorId = authors.length > 0 ? authors[authors.length - 1].author_id + 1 : 1;
//        const newAuthor = { author_id: newAuthorId, first_name: newAuthorFirstName, last_name: newAuthorLastName };
//        console.log('newAuthor:', newAuthor)
//
//        insertData('Authors', newAuthor, (error) => {
//          if (error) {
//            throw new Error(`Error inserting new author: ${error}`);
//          } 
//        });
//
//        authorId = newAuthorId;
//      }
//    }
//
//    return {
//      cover: image, // This is a blob. You might need to convert or handle it depending on the Upload.Dragger usage
//      author_id: authorId,
//      title: title,
//      synopsis: synopsis,
//      media: binding // This assumes 'binding' from ISBNdb correlates directly to your 'media' field
//    };
//
//  } catch (error) {
//    console.error('Error:', error);
//    throw error;
//  }
//};
