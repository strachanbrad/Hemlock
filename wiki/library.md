# Library

How Hemlock stores books, serves them, and shows them: the books and editions
model, the API under `/api`, the client pages, and the dev seed. The schema
is `server/migrations/001_init.sql`; the server code is in `server/src/`
(`routes/books.js`, `routes/editions.js`, `routes/authors.js`, `library.js`,
`validate.js`, `body.js`, `coverFiles.js`); the client pages are in
`client/src/pages/Library/`, `AddBook/` and `Authors/`.

## The model

Three tables:

| Table | Holds |
|---|---|
| `authors` | `name`, unique without regard to ASCII case. Co-authors are one row with the names joined by " & " (`Caroline Peckham & Susanne Valenti`). |
| `books` | The work: `title`, `author_id`, `synopsis`, `star_rating`, `spice_rating` and `gore_rating` (0 to 5), `read`, `wishlist`, a fallback `cover`, `created_at`, `updated_at`. |
| `editions` | A format the household owns: `book_id`, `format` (`hardcover`, `paperback` or `ebook`), `isbn`, `publisher`, `published`, `cover`. |

What the rows mean:

- **Owned** means the book has at least one edition. A book with none is
  wanted but not owned.
- **`wishlist`** means a physical copy is wanted; the buy list is every book
  with it set. Adding a hardcover or paperback edition clears it; adding an
  ebook edition does not. A book created with a physical edition never has
  it set.
- **A title is unique per author** (`books_author_title`), so a second format
  of a book is an edition of it, not a second book.
- **`isbn`** is always ISBN-13 or NULL (store-only ebooks have none), and is
  unique across editions. A book has at most one edition of each format
  without an ISBN (`editions_book_format_without_isbn`), so a double tap
  cannot add the same ebook twice; two paperbacks with different ISBNs are
  allowed.
- **`published`** is `YYYY`, `YYYY-MM` or `YYYY-MM-DD`.
- **Names and titles** are stored trimmed with inner whitespace collapsed.
  Comparisons ignore case for ASCII letters only (`NOCASE`): `Brontë` and
  `BRONTË` are different names.
- `updated_at` is bumped by the `books_updated_at` trigger.

The tables are `STRICT`, so a value of the wrong type (a rating of `2.5`) is
refused by SQLite as well as by the validator.

### The cover rule

A book's cover is the cover of its first edition that has one, taking
editions in the order physical before ebook, hardcover before paperback, then
lowest id; when no edition has a cover, it is `books.cover`. The `editions`
array of every response uses the same order (physical first). The rule is
`bookCover()` in `server/src/library.js`, so every query that shows a book's
cover shares it.

### Cover files

Covers live in `DATA_DIR/covers/` (served at `/covers/<file>`), named by the
server: `e<edition id>-<8 hex>.<ext>` for an edition, `b<book id>-<8 hex>.<ext>`
for a book, with `jpg`, `png` or `webp` from the file's magic bytes. A
replaced cover gets a new name, so a long browser cache is safe.

`withCoverFiles()` in `server/src/coverFiles.js` runs every write that touches
a cover in one transaction:

1. An uploaded cover is written (`writeCover()`, flag `wx`) inside the
   transaction, after the row it belongs to exists; its name is stored.
2. A cover that is replaced or removed, and every cover of a deleted edition
   or book, is collected while the transaction runs.
3. If the transaction throws, the files it wrote are removed and the
   collected ones are kept. If it commits, the collected files are deleted
   (`deleteCover()`, a missing file ignored).
4. A `cover_from_url` is downloaded only after the commit, since a
   transaction cannot wait for the network: `attachDownloadedCovers()` calls
   `saveCoverFromUrl()` ([Lookup § Cover downloads](lookup.md#cover-downloads))
   and, when it succeeds, a second transaction points the row at the new
   file and the cover it replaces is deleted. A failed download changes
   nothing, so a new record has no cover; a row deleted while its cover
   downloaded leaves the file unreferenced, and it is removed.

A crash between a write and the commit can leave an unreferenced file, which
is harmless.

## The API

JSON in and out; lists are arrays. Every route is in `server/src/routes/`.

| Request | Answer |
|---|---|
| `GET /api/books?q=&author_id=&format=&owned=&wishlist=&read=` | 200, an array of books without `synopsis`, ordered by title, then id |
| `GET /api/books/:id` | 200, the book with `synopsis` |
| `POST /api/books` | 201, the book |
| `PATCH /api/books/:id` | 200, the book |
| `DELETE /api/books/:id` | 204; its editions and every cover file go with it |
| `POST /api/books/:id/editions` | 201, the whole book |
| `PATCH /api/editions/:id` | 200, the whole book |
| `DELETE /api/editions/:id` | 200, the whole book; the edition's cover file goes with it |
| `GET /api/authors` | 200, `[{ id, name, book_count }]` ordered by name |
| `PATCH /api/authors/:id` | 200, `{ id, name, book_count }` |
| `DELETE /api/authors/:id` | 204 |
| `GET /api/health` | 200, `{ ok: true, version, schema }` |

A book in a response:

```json
{
  "id": 4,
  "title": "Fifty Shades of Grey",
  "author": { "id": 4, "name": "E.L. James" },
  "star_rating": 3, "spice_rating": 5, "gore_rating": 1,
  "read": false, "wishlist": false,
  "created_at": "2023-01-11 09:00:00",
  "cover_url": "/covers/e4-9778cccc.jpg",
  "editions": [
    { "id": 4, "format": "paperback", "isbn": "9780345803481", "publisher": "Vintage Books", "published": "2012", "cover_url": "/covers/e4-9778cccc.jpg" },
    { "id": 21, "format": "ebook", "isbn": null, "publisher": null, "published": null, "cover_url": null }
  ],
  "synopsis": "…"
}
```

`read` and `wishlist` are JSON booleans; `cover_url` is null when there is no
cover. A write to an edition answers with its whole book, so a page replaces
the book by `id` without another request.

### Bodies

- A body is JSON, or multipart with exactly a `data` part (the same JSON as a
  string) and an optional `cover` file (`server/src/body.js`). Any other part
  is 400. Multer hands every field as a string, so no field is ever read from
  a multipart part except through `data`.
- One validator, `server/src/validate.js`, checks every payload. An unknown
  field is 400. Booleans are `true`/`false` (`1`/`0` accepted).
- **Book:** `title`; exactly one of `author_id` or `author_name` on POST, at
  most one on PATCH; `synopsis`; `star_rating`, `spice_rating`, `gore_rating`;
  `read`; `wishlist`; `cover_from_url`; on POST an optional `edition`; on
  PATCH `"cover": null` removes the book's own cover. `author_name` finds the
  author without regard to case, or creates one, in the same transaction as
  the book; there is no other way to create an author. An unknown
  `author_id` is 400.
- **Edition:** `format` (required on POST), `isbn` (ISBN-10 or ISBN-13,
  hyphens, spaces and an `ISBN:` label ignored, check digit verified, stored
  as ISBN-13; `""` or null means none), `publisher`, `published`,
  `cover_from_url`; on PATCH `"cover": null` removes the cover.
- **Covers:** the multipart `cover` goes to the edition when a POST carries
  one, otherwise to the book. A request carries at most one cover source (the
  file, a `cover_from_url`, or `"cover": null`). `cover_from_url` (on the
  book for its own cover, or on the edition) must be an https URL on the
  download allow-list ([Security § Downloads](security.md#downloads));
  anything else is 400 before anything is saved or fetched. The response
  waits for the download: when it fails, the record is saved and its
  `cover_url` is null (or the previous cover on a replacement), which the
  pages report as saved without the cover. `cover_url` is output-only.

### List filters

- `q`: a substring of the title or the author's name, without regard to ASCII
  case (`%`, `_` and `\` match literally). When `q` is a valid ISBN-10 or
  ISBN-13, it also matches any edition with that ISBN exactly.
- `author_id`: one author's books.
- `format`: `hardcover`, `paperback`, `ebook`, or `physical` (either of the
  first two): books with at least one such edition.
- `owned`, `wishlist`, `read`: `1`, `0`, `true` or `false`.
- Any other value, an unknown filter, or a filter given twice is 400. There is
  no paging; the client sorts.

### Errors

Every error is `{ "error": "<message>" }`; SQLite's own message goes to the
server log only ([Security](security.md#error-bodies)).

| Status | When |
|---|---|
| 400 | Invalid input; a constraint the validator missed. |
| 404 | An unknown or malformed id. |
| 409 | A conflict, with the existing record: `{ error, conflict: { book_id } }` for a title the author already has; `{ error, conflict: { book_id, edition_id } }` for an ISBN already in the library, or a second edition of one format without an ISBN; `{ error, conflict: { author_id } }` for an author name in use; `{ error, conflict: { book_count } }` for deleting an author who has books. |
| 413 | A cover over 10 MB (nginx answers its own 413 with an HTML body). |

## The pages

The client asks the server only through `client/src/api/books.js`,
`editions.js` and `authors.js`, over `request.js`, which never assumes an
error body is JSON. A phone is below 768px: `useIsPhone()` in
`client/src/lib/viewport.js` reads `matchMedia('(max-width: 767.98px)')`
through `useSyncExternalStore`, so the first render already has the right
layout. Styles are in `client/src/styles/`.

### The shell

`client/src/App.jsx`. On a desktop, a header and a sider with Library, Buy
list, Add book, Authors, and Display (opens `/display` in a new tab). On a
phone, a 56px header and a fixed bottom tab bar of Library, Buy list, Add and
Authors; Display is not on it. Content padding is 24px, 16px on a phone. `/`
goes to `/library`.

### Library

`/library` (`pages/Library/Library.jsx`) keeps its filters in the address:
the buy list is `/library?wishlist=1`, physical books `?format=physical`,
ebooks `?format=ebook`, one author's books `?author_id=<id>`. The search
waits 250 ms after the last keystroke.

- **Desktop:** a toolbar of search and Format, Owned, Wishlist and Read
  selects, and a table that scrolls inside its own box: cover, title,
  author, format tags (and Wishlist), read, stars, spice, gore, and the date
  added (hidden below 992px). Every column but the cover sorts; 25 rows a
  page. Read and the ratings change in place; a click elsewhere on a row
  opens the book.
- **Phone:** a sticky search with a Filters button (its badge counts the
  active filters) that opens a bottom drawer with the four filters and a
  Sort select (title, author, stars, spice, gore, recently added). Active
  filters show as closable tags. One card per book: cover, title, author,
  format tags, a 32px read toggle, and the three ratings as read-only
  numbers, since a tap on a scrolling list would mis-rate. On the buy list
  each card has Purchased, which opens the book's purchase form.
- An empty result says "No books match" with Clear filters.

A rating or read change shows at once, is saved with `PATCH`, reverts with an
error message if the save fails, and of overlapping saves to one book only
the newest answer is applied (`useLibrary.js`, `client/src/lib/latest.js`).

### The book

`/library/:id` opens a drawer over the list (640px; the full screen on a
phone); Back closes it.

- The cover, the author (a link to their books), the format tags, read and
  the three ratings as 32px controls, the synopsis.
- **Edit** turns title, author and synopsis into a form; Save sends only the
  changed fields and returns to the view only when the save succeeds; a
  conflict shows under the title.
- **Editions:** each with its format, ISBN or "No ISBN", publisher and year,
  cover, and Change cover, Edit and Delete (with a confirmation). **Add
  edition** opens the edition form; **Mark as purchased**, shown while
  `wishlist` is set, opens it with Hardcover and Paperback only.
- A book with no editions has Change cover for its own cover.
- **Delete book** asks first, naming how many editions and covers go with it.

The edition form (`EditionForm.jsx`): format, ISBN with Look up and Scan
(below), cover, and Publisher and Published behind "More". A lookup fills
publisher, date, the format (physical only when marking a purchase) and the
cover. A chosen cover file is scaled in the browser to at most 1200px on its
long side (`client/src/lib/resizeImage.js`) before it is sent.

### Add a book

`/add` (`pages/AddBook/AddBook.jsx`), one column on a phone and two from
992px: ISBN, title, author, format (Hardcover, Paperback, Ebook or Not owned
yet), "Want a physical copy" for an ebook (always on for Not owned yet),
publisher and date behind "More", cover, read, ratings, synopsis. The author
field (`AuthorSelect.jsx`) lists the authors and, when the typed name matches
none of them without regard to case, offers Add "<name>", which sends
`author_name`. A book not owned yet keeps its cover on the book. When the
title or the ISBN is already in the library, the page offers Open the
existing book and, for a title, Add this as an edition.

**Scan and look up.** The ISBN field (`components/IsbnField.jsx`, also in
the edition form) is checked with `client/src/lib/isbn.js` and has two
buttons:

- **Scan** opens the camera in a dialog; the scanner and its WASM load on
  the first tap ([Lookup § Barcode scanning](lookup.md#barcode-scanning)). A
  scanned ISBN is looked up at once.
- **Look up** (or Enter) sends a typed ISBN to `GET /api/lookup/:isbn`
  through `client/src/api/lookup.js`.

The answer fills the form (`client/src/lib/prefill.js`): title; author,
matched to an existing author without regard to case, else offered as a new
one (co-authors joined with " & "); synopsis; publisher and date; and the
format hint when no format is chosen yet. A scan never preselects Ebook: the
person is holding a printed book. A lookup that finds nothing says so and
leaves the form for typing.

The lookup's cover shows as a preview, the one image the browser loads from
another host (Open Library's cover server, which redirects to archive.org, or
Google Books). It is sent as
`cover_from_url` on save unless a file is chosen or "Don't use this cover"
is tapped; if the server cannot download it, the book is saved without it
and the page says so. The page ends with the credit "Book data from Open
Library", which names Google Books too once a lookup shows a Google key is
set.

### Authors

`/authors` (`pages/Authors/Authors.jsx`): a table on a desktop, a list on a
phone, with a search. A name opens that author's books. Rename is inline; a
name in use is refused with "An author named … exists". Delete is offered
only for an author with no books.

## The seed

`server/seed/seed.sql`, loaded by `npm run db:reset` (run on the dev machine
from the root of the checkout; [Development setup](dev-setup.md#the-dev-data-directory)),
with its covers in `server/seed/covers/`. It holds 13 authors, 23 books and
25 editions, and covers the cases the model has:

- physical books with real ISBN-13s for their titles, publishers and dates;
- ebooks without an ISBN, several on the buy list;
- books in two formats (Fifty Shades of Grey, War and Peace, One Hundred
  Years of Solitude), so physical-first ordering shows;
- a co-authored book (Zodiac Academy: Shadow Princess);
- a book wanted but not owned (Emma), with no edition;
- books without a cover, and a PNG cover among JPEGs.

`server/test/seed.test.js` checks that every ISBN is valid and that the
cover directory holds exactly the files the seed names, each with the
extension its bytes show.
