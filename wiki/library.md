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
  only on the wishlist.
- **`wishlist`** means a physical copy is wanted; the Wishlist is every book
  with it set. Adding a hardcover or paperback edition clears it, and so does
  changing an ebook edition to one of them (`PATCH /api/editions/:id`, in the
  same transaction); adding an ebook edition does not, and neither does
  changing a hardcover to a paperback or back. A book created with a physical
  edition never has it set.
- **A title is unique per author** (`books_author_title`), so a second format
  of a book is an edition of it, not a second book.
- **`isbn`** is always ISBN-13 or NULL (store-only ebooks have none), and is
  unique across editions. A book has at most one edition of each format
  without an ISBN (`editions_book_format_without_isbn`), so a double tap
  cannot add the same ebook twice; two paperbacks with different ISBNs are
  allowed.
- **`published`** is `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, and a real date:
  `2023-02-31` answers 400.
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
   and, when it succeeds, a second statement points the row at the new file
   and the cover it replaces is deleted. A failed download changes nothing,
   so a new record has no cover. The download carries the row's `cover` and
   `created_at` as its transaction committed them (`coverDownload()`), and
   the file is attached only while the row still holds both. A row deleted
   during the download, given another cover meanwhile (an upload), or
   replaced by a new row under the same id (SQLite gives the highest id out
   again once it is deleted) keeps what it has; the downloaded file is
   removed and nothing else is deleted.

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
| `GET /api/events` | 200, an event stream that stays open ([Live updates](#live-updates)); 503 `{ error }` past 50 open streams and polls |
| `GET /api/changes?since=&wait=` | 200, `{ version }`, at once or after a hold of up to `wait` seconds ([Live updates](#live-updates)); 503 `{ error }` past 50 open streams and polls |

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
cover. `created_at` is UTC (SQLite's `datetime('now')`, with no zone marker);
the table's Added column shows it as a date in the browser's time zone
(`localDate()` in `client/src/lib/dates.js`). A write to an edition answers with its whole book, so a page replaces
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

## Live updates

A page that shows the library learns of a change made on another device
without a reload, and fetches only then: once when it opens, and again when
it is told.

- **The stream.** `GET /api/events` (`server/src/events.js`) answers
  `text/event-stream` and stays open. It starts with `retry: 5000` (the
  browser waits 5 seconds before reconnecting), sends a `: ping` comment
  every 25 seconds on one timer shared by every page, and, after a change,
  `event: changed` with `data: {"kind":"library"}`. Nothing else goes down
  it. At most 50 streams and held polls (below) are open at once; the next
  one is answered 503.
- **What sends `changed`.** One middleware in `server/src/app.js`, not the
  routes: a `POST`, `PATCH`, `PUT` or `DELETE` under `/api/books`,
  `/api/editions` or `/api/authors` whose response finishes with a 2xx
  status. A refused write (4xx or 5xx), a read, the admin routes and the
  lookups send nothing. The writer's own pages are told too and fetch
  again. A write whose client disconnects before the answer (a phone that
  loses its connection while a cover downloads) is saved but sends
  nothing; the pages catch up at the next change.
- **The pages.** `watchChanges()` in `client/src/api/events.js` holds an
  `EventSource` on `/api/events`; `useChanges()` in
  `client/src/lib/useChanges.js` subscribes once per page and calls the page
  once 300 ms after the first event of a burst. `/library` fetches the list
  for its current filters and the open book again, `/authors` its list, and
  `/display` its books ([TV display § Timing](display.md#timing)). The add
  page, the admin page and the scanner listen to nothing. A fetch that fails
  keeps what the page shows, except the open book once it answers 404,
  which the drawer reports as not found.
- **Saves in flight.** A list or book fetched while a rating, read or
  wishlist save is pending keeps the value that save shows
  (`pending(bookId)` in `client/src/lib/fieldSaves.js`), so a fetch that
  started before the save never flips it back; once the save settles, the
  next fetch shows what the server holds.
- **Reconnecting.** The browser reconnects a dropped stream by itself, but
  gives up for good on an error answer (nginx's 502 while the server
  restarts, or the 503), so `watchChanges()` opens a new `EventSource` 5
  seconds after one closes. Every open after a failure counts as a change
  (`reconnected`), since one may have happened meanwhile, and the page
  fetches again.
- **Without `EventSource`.** `liveUpdatesSupported()` is false, nothing is
  opened, `/library` and `/authors` fetch only when opened, and `/display`
  falls back to fetching every 5 minutes.
- **The long poll.** A client that cannot hold a stream (a Roku channel)
  asks `GET /api/changes?since=<version>&wait=<seconds>` in a loop. The
  server keeps a `version`: the time it started, in milliseconds, plus one
  for every `changed` it has sent. The answer is always `{ version }` with
  `Cache-Control: no-store`: at once when `since` is absent, not a number,
  or not the current version; otherwise the request is held until the next
  change (answered with the new version) or for `wait` seconds (25 when
  absent or not a number, at most 30; answered with the same version).
  A client fetches the library when the version it gets differs from the
  one it sent, and asks again with the new one. A held request is dropped
  when its client closes, and counts toward the 50 with the streams.

Over HTTP/1.1 a browser opens at most six connections to one host, and each
open Library, Authors or Display tab holds one for its stream: with six such
tabs open, every other request to the host waits. The dev server speaks
HTTP/1.1; a proxy that serves HTTP/2 carries every stream on one
connection. The proxy's part is in
[Deployment § The reverse proxy](deployment.md#the-reverse-proxy).

The tests: `server/test/events.test.js` (the stream's headers and lines,
what sends `changed` and what does not, the pings, the cap, and the long
poll's answers and holds); `client/test/useChanges.test.jsx` (the stream,
reconnecting, the 300 ms window), `useLibrary.test.jsx`, `fieldSaves.test.js`,
`AuthorsPage.test.jsx` and `Display.test.jsx`, with `EventSource` stubbed by
`client/test/eventSource.js` (jsdom has none).

## The pages

The client asks the server only through `client/src/api/books.js`,
`editions.js` and `authors.js`, over `request.js`, which never assumes an
error body is JSON, and hears of changes through `events.js`. A phone is
below 768px: `useIsPhone()` in `client/src/lib/viewport.js` reads
`matchMedia('(max-width: 767.98px)')` through `useSyncExternalStore`, so the
first render already has the right layout. Styles are in `client/src/styles/`; the palette, fonts, ornaments and
the rules for a new page are in [Theme](theme.md).

### The shell

`client/src/App.jsx`. The header carries the wordmark, the logo and "The
Hemlock". On a desktop, a sider with Library, Wishlist, Add book, Authors,
and Display (opens `/display` in a new tab); the current item has a brass bar
and a small umbel. On a phone, a 56px header and a fixed bottom tab bar of
Library, Wishlist, Add and Authors; Display is not on it. Content padding is
24px, 16px on a phone. `/` goes to `/library`. Every page title is a
`PageHeading` (`components/Headings.jsx`), with the count of what it lists
beside it on Library, Wishlist and Authors.

### Library

`/library` (`pages/Library/Library.jsx`) keeps its filters in the address:
the Wishlist is `/library?wishlist=1`, physical books `?format=physical`,
ebooks `?format=ebook`, one author's books `?author_id=<id>`. The search
waits 250 ms after the last keystroke, and what is typed while the list
updates stays in the box (`SearchBox.jsx`).

- **Desktop:** a toolbar of search and Format, Owned (Owned or Wishlist
  only), Wishlist (On the wishlist) and Read selects, and a table that
  scrolls inside its own box: cover, title, author, formats (a bookmark
  toggle for the wishlist, then a tag per edition), read, stars, spice, gore,
  and the date added (hidden below 992px). Every column but the cover sorts; 25 rows a
  page. Read and the ratings change in place; a click elsewhere on a row
  opens the book.
- **Phone:** a sticky search on its own row, then a Filters button (its
  badge counts the active filters) and the view toggle; Filters opens a
  bottom drawer with the four filters and a Sort select (title, author,
  stars, spice, gore, recently added). Active filters show as closable tags. One card per book: cover, title, author,
  format tags, 32px wishlist and read toggles, and the three ratings as
  read-only numbers, since a tap on a scrolling list would mis-rate. On the
  Wishlist each card has Purchased, which opens the book's purchase form.
- An empty library says "Nothing on the shelf yet" with Add a book; an
  empty Wishlist "Nothing on the wishlist"; any other empty result "No books
  match" with Clear filters (`components/ShelfEmpty.jsx`).

A wishlist, rating or read change shows at once and is saved with `PATCH`
(`useLibrary.js`, `client/src/lib/fieldSaves.js`). Each field of a book
settles on its own, so overlapping saves of the stars and the read toggle
never undo each other: while a field's newest save is pending it shows that
save's value; once that save settles it shows what the server stored, the
value of the newest save that succeeded, or the value from before the
overlapping saves when none did. A failed newest save reverts its field with
an error message.

### Cover flow view

`/library?view=flow` shows the same books (search, filters and sort
applied) as a row of covers in 3D instead of the table or the cards
(`pages/Library/CoverFlow.jsx`, its geometry and step logic in
`pages/Library/coverflow.js`, styles in `styles/coverflow.css`).

- **The toggle.** List and Flow sit at the end of the toolbar on a desktop
  and beside Filters on a phone (icons only there). Choosing one writes
  `view=flow` to the address, or removes `view` for the list, and remembers
  the choice in `localStorage` (`hemlock.library.view`). An address without
  `view` shows the remembered view, the list when there is none; `view=list`
  or `view=flow` in a shared link wins over it. Clear filters keeps the view.
- **What it shows.** The centre cover faces the viewer at full size; the
  covers either side stand turned about 60° toward it, smaller and pushed
  back, overlapping, each with a faded mirror image beneath (a flipped copy
  under a `mask-image` gradient, since Firefox has no `-webkit-box-reflect`).
  A book without a cover shows `BookCover`'s cloth cover with its title in
  the same 2:3 box. Under the row, set like the book's drawer: the centre
  book's title (a link to it), author, format tags, "On the wishlist" when
  set, and its position, "12 of 23". An empty result
  shows the list's "No books match".
- **Moving.** The wheel steps one book per notch, either axis; a stream of
  small trackpad deltas adds up to steps, at most one per 70 ms. A drag with
  the mouse or a swipe follows the pointer and settles on the nearest book,
  plus up to three more for a flick. With the row focused (Tab; it shows a
  focus ring), ArrowLeft and ArrowRight step, Home and End jump to the ends,
  and Enter opens the centre book. A click or tap on a side cover centres
  it; on the centre cover it opens the book as the list does
  (`/library/:id`, Back closes it). The wheel over the row never scrolls the
  page; a vertical swipe on a phone still does (`touch-action: pan-y`).
- **Keeping its place.** When the list changes (a search, a filter, a saved
  rating), the centred book stays centred if it is still listed; otherwise
  the same position is kept, clamped to the new list.
- **Rendering.** Each cover is absolutely placed and moved only by a
  `transform` computed in JavaScript (`coverPose()`), so motion stays on the
  GPU with no layout reads. The stage's width and the window's height are
  read only on mount and on a resize (a `ResizeObserver` and the window's
  `resize` event). From them `flowGeometry()` sizes the centre cover (at
  most 240px, about 55% of a phone's width, smaller in a short window so the
  caption stays in view) and counts the side covers whose projected edge
  still fits inside the stage: two a side on a phone, up to seven on a wide
  desktop. Only those covers and one invisible cover parked on each end slot
  are mounted, at most 17 nodes however long the list, so a library of
  thousands stays smooth; the parked cover fades in as the row steps. Covers
  load lazily and the stage has a fixed height, so nothing shifts while the
  list loads.
- `prefers-reduced-motion` turns the transitions off: covers move straight
  to their places.

### The book

`/library/:id` opens a drawer over the list (640px; the full screen on a
phone); Back closes it.

- The header holds the title and a bookmark button, "Add to wishlist" or
  "On the wishlist", which saves `{ wishlist }` with `PATCH` like the
  toggles in the list.
- The cover in a frame with brass corners, the author (a link to their
  books), the format tags, read and the three ratings as 32px controls, the
  synopsis.
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
cover, replaces what an earlier lookup filled the way the add page does
(below), and adds the same credit line under the form. A chosen cover file is scaled in the browser to at most 1200px on its
long side (`client/src/lib/resizeImage.js`) before it is sent.

### Add a book

`/add` (`pages/AddBook/AddBook.jsx`) is four sections:

1. **Find it:** the ISBN field with Scan and Look up (below), Scan the
   primary button, and one line of help.
2. **The book:** the cover picker beside its preview at the left (above the
   fields on a phone), then title, author and the ownership choice, "I own
   it" or "On my wishlist". Owned, it asks for the format (Hardcover,
   Paperback or Ebook), "Want a physical copy" for an ebook, and publisher
   and date behind "More". On the wishlist, it asks for no format and says
   the book goes on the wishlist.
3. **Your take:** read and the three ratings in one labelled row (one row
   each on a phone).
4. **Synopsis.**

Then Reset and Add book, a bar stuck above the tab bar on a phone. The body
is built by `bookPayload()` in `pages/AddBook/payload.js`: an owned book is
sent with its `edition` and `wishlist` set only for an ebook wanting a
physical copy; a wishlist book is sent with `wishlist: true`, no edition,
and its cover on the book. The author field (`AuthorSelect.jsx`) lists the
authors and, when the typed name matches none of them without regard to
case, offers Add "<name>", which sends `author_name`. When the title or the
ISBN is already in the library, the page offers Open the existing book and,
for a title, Add this as an edition. The notice sits above the buttons, so
the page scrolls it into view (on a phone the buttons are in the sticky
bar, far below the top) and shows the conflict as a warning message too.

**Scan and look up.** The ISBN field (`components/IsbnField.jsx`, also in
the edition form) is checked with `client/src/lib/isbn.js` and has two
buttons:

- **Scan** opens the camera in a dialog; the scanner and its WASM load on
  the first tap ([Lookup § Barcode scanning](lookup.md#barcode-scanning)). A
  scanned ISBN is looked up at once.
- **Look up** (or Enter) sends a typed ISBN to `GET /api/lookup/:isbn`
  through `client/src/api/lookup.js`.

When no catalogue knows the ISBN and a Claude key is set, the field then
asks Claude, which searches the web for a listing of the edition ("Not in
the catalogues. Asking Claude…"); its answer fills the form the same way
([Lookup § Asking Claude](lookup.md#asking-claude)).

The answer fills the form (`client/src/lib/prefill.js`): title; author,
matched to an existing author without regard to case, else offered as a new
one (co-authors joined with " & "); synopsis; publisher and date; and the
format hint when no format is chosen yet. A scan never preselects Ebook: the
person is holding a printed book. Each lookup first resets every field the
previous lookup filled that the person has not changed since, and drops its
cover, so the form never mixes two books (`untouchedFields()` in
`prefill.js`). A lookup that finds nothing, or fails, for another ISBN says
so and leaves the form for typing; one for the ISBN already filled in changes
nothing.

The cover preview shows what the book will be saved with: a chosen file, else
the lookup's cover, else a cloth cover with the typed title. The lookup's
cover is the one image the browser loads from another host (Open Library's cover server, which redirects to archive.org, or
Google Books). It is sent as
`cover_from_url` on save unless a file is chosen or "Don't use this cover"
is tapped; if the server cannot download it, the book is saved without it
and the page says so. The page ends with the credit "Book data from Open
Library", which names Google Books too once a lookup shows a Google key is
set, or, for a book Claude found, "Book data from <host>, found by Claude"
with the listing linked.

### Authors

`/authors` (`pages/Authors/Authors.jsx`): a table on a desktop, a list on a
phone, with a search; "No authors yet" or "No authors match" when there is
nothing to list. A name opens that author's books. Rename is inline; a
name in use is refused with "An author named … exists". Delete is offered
only for an author with no books.

## The seed

`server/seed/seed.sql`, loaded by `npm run db:reset` (run on the dev machine
from the root of the checkout; [Development setup](dev-setup.md#the-dev-data-directory)),
with its covers in `server/seed/covers/`. It holds 13 authors, 23 books and
25 editions, and covers the cases the model has:

- physical books with real ISBN-13s for their titles, publishers and dates;
- ebooks without an ISBN, several on the wishlist;
- books in two formats (Fifty Shades of Grey, War and Peace, One Hundred
  Years of Solitude), so physical-first ordering shows;
- a co-authored book (Zodiac Academy: Shadow Princess);
- a book only on the wishlist (Emma), with no edition;
- books without a cover, and a PNG cover among JPEGs.

`server/test/seed.test.js` checks that every ISBN is valid and that the
cover directory holds exactly the files the seed names, each with the
extension its bytes show.
