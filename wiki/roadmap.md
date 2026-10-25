# Roadmap

The work planned for Hemlock: the library (books, editions and the phone
layout, which land together) comes next. This page describes work that does
not exist yet, in the present-tense voice of the rest of the wiki; a step
leaves this page when it is built and is described on its own page. Nothing
is deployed, so a step may change the schema, the API or the file layout
without a compatibility path.

## 3. Books and editions

- **Books** hold the work: title, author, synopsis, star, spice and gore
  ratings, read status, a `wishlist` flag, and a fallback cover for a book
  that is wanted but not yet owned.
- **Editions** hold a format the household owns: format (hardcover,
  paperback, ebook), ISBN (optional, since store-only ebooks have none),
  cover, publisher and publication date. A book with no editions is not
  owned.
- A book's `wishlist` flag means a physical copy is wanted; the buy list is
  every book with the flag set.
- The separate Books and EBooks lists and the Buy List become one library
  with filters on format, owned, wishlist and read status.
- **Mark as purchased** adds a physical edition to the same book and clears
  its `wishlist` flag, so ratings and read status carry over. An ebook
  edition does not clear it.
- Adding a book and marking one purchased start from a barcode scan
  (`BarcodeScanner`) or a typed ISBN, prefilled from `GET /api/lookup/:isbn`
  and saved with the chosen cover ([Lookup](lookup.md)); a scanned book is
  never preselected as an ebook.
- A title is unique per author, so a second format of a book becomes an
  edition of it rather than a second book.
- An author is one `name` field; first and last name splitting fails on
  multi-part and pen names.
- The API is resource-shaped (`/api/books`, `/api/editions`,
  `/api/authors`) with validated input; the server returns each book with
  its author's name and editions, so no page merges authors by hand.

## 4. Phone layout

- The navigation becomes a bottom tab bar on a phone and stays a sider on a
  desktop.
- The library table becomes a one-column card list below 768px.
- Inline styles move into stylesheets and theme tokens, per
  [style.md](style.md#ant-design).
- This step lands together with step 3, since both rewrite the same pages.

## Later

- An admin page for theming and preferences, and the choice of which ratings
  to show.

## Decided against

- **ISBNdb.** A paid subscription for data Open Library (and Google Books,
  with a key) provide for a personal library.
- **Docker Compose and Caddy.** The host runs nginx, Node and SQLite
  directly; TLS belongs to the owner's existing reverse proxy.
- **A status on editions.** A wishlist row would need a format before the
  format is known, and owned is already "has an edition"; the wish is a flag
  on the book.
- **A third table for individual copies.** Books and editions cover what is
  owned and what is wanted; a copies table is added only if purchase dates,
  prices or loans are wanted.
- **User accounts.** The app sits behind the owner's reverse proxy for one
  household; access control belongs to the proxy.
