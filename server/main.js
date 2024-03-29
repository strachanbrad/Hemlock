const express = require('express');
const multer = require('multer');
const https = require('https');
const path = require('path');
const methodOverride = require('method-override')
const fs = require('fs');
const cors = require('cors');
const { Scraper, Root, CollectContent, DownloadContent } = require('nodejs-web-scraper');
const sqlite3 = require('sqlite3');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const idFieldNames = {
  Books: 'isbn',
  EBooks: 'isbn',
  Authors: 'id',
}

sqlite3.verbose();
app.use(express.json());
app.use(methodOverride());

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

const openDb = () => {
  return new sqlite3.Database(path.resolve(__dirname, 'hemlock.db'), sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
      console.error('Error opening database', err);
    } 
  });
}

const closeDb = (db) => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
  });
}

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    // Use the environment variable
    const coversDir = process.env.COVERS_DIR;
    cb(null, path.join(__dirname, coversDir));
  },
  filename: function(req, file, cb) {
    const isbn = req.params.isbn;
    const filename = `${isbn}.jpg`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  // Add file filter for limiting to certain file types
}).single('cover');

const insertDataIntoTable = async (db, table, data) => {
  const columns = Object.keys(data).map(col => `"${col}"`).join(', ');
  const placeholders = Object.keys(data).map(() => '?').join(', ');
  const values = Object.values(data);
  const query = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`;

  return new Promise((resolve, reject) => {
    db.run(query, values, function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
};

// Function to filter and prepare book data for database operations
const prepareBookData = (body) => {
  const validFields = ['isbn', 'title', 'read', 'star_rating', 'spice_rating', 'gore_rating', 'media', 'synopsis', 'author_id', 'buy'];
  return Object.entries(body).filter(([field]) => validFields.includes(field));
};


app.post('/api/data/:table', async (req, res) => {
  const table = req.params.table;
  const data = req.body;
  const db = openDb();

  if (!table || typeof table !== 'string' || !data || typeof data !== 'object' || Object.keys(data).length === 0) {
    closeDb(db);
    return res.status(400).json({ message: "Invalid table name or data" });
  }

  try {
    const lastId = await insertDataIntoTable(db, table, data);
    closeDb(db);
    res.json({ message: "Record added successfully", lastID: lastId });
  } catch (error) {
    closeDb(db);
    res.status(500).json({ message: "Error inserting data into database", error: error.message });
  }
});

app.delete('/api/data/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  const db = openDb();
  const idFieldName = idFieldNames[table];

  if (!table || typeof table !== 'string' || !id) {
    closeDb(db);
    return res.status(400).json({ message: "Invalid table name or id" });
  }

  try {
    const query = `DELETE FROM "${table}" WHERE ${idFieldName} = ?`;
    db.run(query, [id], function(err) {
      if (err) {
        closeDb(db);
        return res.status(500).json({ message: "Error deleting data from database", error: err.message });
      }

      if (this.changes === 0) {
        closeDb(db);
        return res.status(404).json({ message: "No record found with the provided id" });
      }

      closeDb(db);
      res.json({ message: "Record deleted successfully" });
    });
  } catch (error) {
    closeDb(db);
    res.status(500).json({ message: "Error processing your request", error: error.message });
  }
});

app.post('/api/convertEBookToBook', async (req, res) => {
  const ebookIsbn = req.body.isbn;
  const media = req.body.media
  const db = openDb();

  if (!ebookIsbn) {
    closeDb(db);
    return res.status(400).json({ message: "ISBN must be provided" });
  }

  // Start a transaction
  db.serialize(() => {
    db.run('BEGIN');

    try {
      // Fetch the eBook
      db.get(`SELECT * FROM "EBooks" WHERE isbn = ?`, [ebookIsbn], async (err, ebook) => {
        if (err) {
          db.run('ROLLBACK');
          closeDb(db);
          return res.status(500).json({ message: "Error fetching EBook", error: err.message });
        }

        if (!ebook) {
          db.run('ROLLBACK');
          closeDb(db);
          return res.status(404).json({ message: "EBook not found" });
        }

        // Prepare the book data by excluding the 'buy' field
        const { buy, ...bookData } = ebook;
        bookData.media = media;

        try {
          // Insert the book data into the Books table
          await insertDataIntoTable(db, 'Books', bookData);

          // Delete the eBook entry after successful conversion
          db.run(`DELETE FROM "EBooks" WHERE isbn = ?`, [ebookIsbn], function(err) {
            if (err) {
              db.run('ROLLBACK');
              closeDb(db);
              return res.status(500).json({ message: "Error deleting EBook", error: err.message });
            }

            // Commit the transaction
            db.run('COMMIT');
            closeDb(db);
            res.json({ message: "EBook converted to Book successfully" });
          });
        } catch (error) {
          db.run('ROLLBACK');
          closeDb(db);
          return res.status(500).json({ message: "Error inserting Book", error: error.message });
        }
      });
    } catch (error) {
      db.run('ROLLBACK');
      closeDb(db);
      res.status(500).json({ message: "Error processing request", error: error.message });
    }
  });
});

app.get('/api/authors', async (req, res) => {
  const db = openDb();
  try {
    const authors = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Authors', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    closeDb(db);
    authors.length ? res.json({ message: "Authors retrieved successfully", data: authors })
                   : res.status(404).json({ message: "No authors found" });
  } catch (error) {
    closeDb(db);
    res.status(500).json({ message: "Error querying database", error: error.message });
  }
});

app.get('/api/:bookType/get', async (req, res) => {
  const bookType = req.params.bookType;
  const db = openDb();

  if (!['Books', 'EBooks'].includes(bookType)) {
    closeDb(db);
    return res.status(400).json({ message: "Invalid book type" });
  }

  try {
    const books = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM ${bookType}`, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    closeDb(db);
    books.length ? res.json({ message: `${bookType} retrieved successfully`, data: books })
                 : res.status(404).json({ message: `No ${bookType} found` });
  } catch (error) {
    closeDb(db);
    res.status(500).json({ message: "Error querying database", error: error.message });
  }
});

app.get('/api/:bookType/author/:authorId', async (req, res) => {
  const { bookType, authorId } = req.params;
  const db = openDb();

  try {
    const books = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM ${bookType} WHERE author_id = ?`, [authorId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    closeDb(db);
    books.length ? res.json({ message: `${bookType} books retrieved successfully`, data: books })
                 : res.status(404).json({ message: `No books found for author ${authorId} in ${bookType}` });
  } catch (error) {
    closeDb(db);
    res.status(500).json({ message: "Error querying database", error: error.message });
  }
});

app.post('/api/:bookType/:isbn/update', upload, async (req, res) => {
  const { isbn, bookType } = req.params;
  const db = openDb();

  try {
    const updates = prepareBookData(req.body);

    const promises = updates.map(([field, value]) =>
      new Promise((resolve, reject) => {
        db.run(`UPDATE ${bookType} SET ${field} = ? WHERE isbn = ?`, [value, isbn], function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      })
    );

    await Promise.all(promises);

    const book = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM ${bookType} WHERE isbn = ?`, [isbn], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    closeDb(db);
    book ? res.json({ message: "Book updated successfully", data: book })
         : res.status(404).json({ message: `Book with ISBN ${isbn} not found in ${bookType}` });
  } catch (error) {
    closeDb(db);
    res.status(500).json({ message: "Error updating database", error: error.message });
  }
});

// Endpoint to insert a new book
app.post('/api/:bookType/:isbn/insert', upload, async (req, res) => {
  const { bookType } = req.params;
  const db = openDb();

  try {
    const bookData = prepareBookData(req.body);
    const fields = bookData.map(([field]) => field).join(', ');
    const placeholders = bookData.map(() => '?').join(', ');
    const values = bookData.map(([_, value]) => value);

    await new Promise((resolve, reject) => {
      db.run(`INSERT INTO ${bookType} (${fields}) VALUES (${placeholders})`, values, function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });

    closeDb(db);
    res.json({ message: "Book inserted successfully" });
  } catch (error) {
    closeDb(db);
    res.status(500).json({ message: "Error inserting book into database", error: error.message });
  }
});

//TODO ISBN Fetch feature (Downloading the image is the issue)
//app.post('/api/downloadCover/:isbn', async (req, res) => {
//  const { isbn } = req.params;
//  const { imageUrl } = req.body;
//
//  if (!imageUrl) {
//    return res.status(400).json({ message: "Image URL is required" });
//  }
//
//  const destination = path.join(__dirname, '../client/public/covers', `${isbn}.jpg`);
//  const file = fs.createWriteStream(destination);
//
//  https.get(imageUrl, (response) => {
//    if (response.statusCode !== 200) {
//      res.status(500).json({ message: 'Failed to fetch image', error: `Server responded with status code ${response.statusCode}` });
//      return;
//    }
//
//    response.pipe(file);
//
//    file.on('finish', () => {
//      file.close(); 
//      res.json({ message: 'Image downloaded successfully' });
//    });
//  }).on('error', (err) => {
//    console.error('Error fetching the image:', err.message);
//    fs.unlink(destination, () => res.status(500).json({ message: 'Error fetching the image', error: err.message }));
//  });
//
//  file.on('error', (err) => {
//    console.error('Error writing the file:', err.message);
//    fs.unlink(destination, () => res.status(500).json({ message: 'Error writing the image', error: err.message }));
//  });
//});
//
//app.post('/upload/:isbn', upload, (req, res) => {
//  if (!req.file) {
//    return res.status(400).send('No file uploaded.');
//  }
//  return res.send('File uploaded successfully.');
//});
