-- Copyright (c) 2023 Hemlock
-- SPDX-License-Identifier: GPL-3.0-only

CREATE TABLE Authors (
    author_id INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL
);

CREATE TABLE "Books" (
    isbn TEXT PRIMARY KEY,
    star_rating INT,
    spice_rating INT,
    gore_rating INT,
    title TEXT NOT NULL,
    author_id INTEGER,
    synopsis TEXT,
    read BOOLEAN,
    media TEXT NOT NULL,
    FOREIGN KEY (author_id) REFERENCES Authors(author_id)
);

CREATE TABLE "EBooks" (
    isbn TEXT PRIMARY KEY,
    star_rating INT,
    spice_rating INT,
    gore_rating INT,
    title TEXT NOT NULL,
    author_id INTEGER,
    synopsis TEXT,
    read BOOLEAN,
    media TEXT NOT NULL,
    buy BOOLEAN,
    FOREIGN KEY (author_id) REFERENCES Authors(author_id)
);
