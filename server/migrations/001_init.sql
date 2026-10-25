-- Copyright (c) 2023 Hemlock
-- SPDX-License-Identifier: GPL-3.0-only

CREATE TABLE authors (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (name <> '' AND name = trim(name))
) STRICT;

CREATE TABLE books (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL COLLATE NOCASE CHECK (title <> '' AND title = trim(title)),
  author_id    INTEGER NOT NULL REFERENCES authors(id),
  synopsis     TEXT NOT NULL DEFAULT '',
  star_rating  INTEGER NOT NULL DEFAULT 0 CHECK (star_rating  BETWEEN 0 AND 5),
  spice_rating INTEGER NOT NULL DEFAULT 0 CHECK (spice_rating BETWEEN 0 AND 5),
  gore_rating  INTEGER NOT NULL DEFAULT 0 CHECK (gore_rating  BETWEEN 0 AND 5),
  read         INTEGER NOT NULL DEFAULT 0 CHECK (read IN (0, 1)),
  wishlist     INTEGER NOT NULL DEFAULT 0 CHECK (wishlist IN (0, 1)),
  cover        TEXT UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
CREATE UNIQUE INDEX books_author_title ON books(author_id, title);

CREATE TABLE editions (
  id         INTEGER PRIMARY KEY,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  format     TEXT NOT NULL CHECK (format IN ('hardcover', 'paperback', 'ebook')),
  isbn       TEXT UNIQUE CHECK (isbn IS NULL OR (length(isbn) = 13 AND isbn NOT GLOB '*[^0-9]*')),
  publisher  TEXT,
  published  TEXT CHECK (published IS NULL
                         OR published GLOB '[0-9][0-9][0-9][0-9]'
                         OR published GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
                         OR published GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  cover      TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
CREATE INDEX editions_book_id ON editions(book_id);
CREATE UNIQUE INDEX editions_book_format_without_isbn ON editions(book_id, format) WHERE isbn IS NULL;

CREATE TRIGGER books_updated_at AFTER UPDATE ON books
  WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE books SET updated_at = datetime('now') WHERE id = NEW.id;
END;
