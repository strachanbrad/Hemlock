DROP TABLE IF EXISTS Authors;
CREATE TABLE Authors (
    author_id INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL
);

DROP TABLE IF EXISTS Books;
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

DROP TABLE IF EXISTS Ebooks;
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
