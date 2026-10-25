# Security

The defaults every change to Hemlock keeps. Hemlock serves one household from
behind the owner's TLS-terminating reverse proxy, which owns access control;
Hemlock itself has no accounts. These rules keep a mistake in the client, a
crafted request or a hostile upload from reaching the database, the file
system or another host.

## Bind address

The server binds `process.env.HOST || '127.0.0.1'` (`server/src/config.js`).
The `||` is deliberate: an empty `HOST` must mean the loopback address, never
every interface, which `??` would allow. In production nginx on the same box
is the only client.

## Error bodies

Every error answers JSON `{ "error": "<message>" }`, built by `errorHandler`
in `server/src/errors.js`:

- A SQLite error's own message names tables, columns and constraints, so it
  goes to the server log only. A uniqueness or primary-key conflict answers
  409, any other constraint failure 400, anything unexpected 500 with
  `Internal server error`.
- A 4xx raised on purpose (`httpError(status, message)`) carries its own
  message.
- An unknown path answers 404 `{ "error": "Not found" }`, under `/api` and
  `/covers` alike.
- `errorHandler` keeps four parameters, the last named `_next`: Express
  recognises an error handler by its arity, and a three-parameter function
  silently becomes ordinary middleware, letting Express's HTML error page
  through.

A client wrapper never assumes an error body is JSON: nginx answers 413 and
502 with HTML (`client/src/api/request.js`).

## Uploads

- A cover upload is bounded before it is held: multer with `memoryStorage`
  and `limits: { fileSize: 10 MB, files: 1 }` (`server/src/routes/books.js`).
  A larger file answers 413.
- The type comes from the file's magic bytes (`imageType()` in
  `server/src/covers.js`: JPEG, PNG or WebP), never from the client's file
  name or MIME type. Anything else answers 400.
- The upload is written inside the database transaction it belongs to, so a
  refused cover leaves no row behind and a failed write leaves no file.

## Cover file names

- The server generates every cover file name; a name from a request never
  reaches the file system. Under the current schema a cover is
  `<isbn>.jpg`, and `saveCoverFromUpload()` accepts only 13 digits, or 9
  digits followed by a digit or `X`, so a path in the ISBN is refused.
- A downloaded cover is `e<edition id>-<8 hex>.<ext>`, or
  `b<book id>-<8 hex>.<ext>` for a book's own cover, with the extension from
  its magic bytes (`saveCoverFromUrl()`).
- A cover is written to a temporary name inside `DATA_DIR/covers/` and renamed
  into place. It never moves from `os.tmpdir()`: under the systemd unit's
  `PrivateTmp` that is another mount, and the rename fails with `EXDEV`.
- `deleteCover()` refuses any name that does not match the server's own
  patterns (`^(e\d+-[0-9a-f]{8}|b\d+-[0-9a-f]{8}|\d{13})\.(jpg|png|webp)$`) and
  ignores a file that is already gone.

## Downloads

The browser never calls an outside service; book lookups go through the
server, which calls only Open Library and Google Books ([Lookup](lookup.md)).
A cover chosen from a lookup reaches the server as a URL from the client, so
without bounds the server would fetch whatever a request names, a loopback or
LAN address included. `saveCoverFromUrl()` (`server/src/covers.js`) fetches
a cover only:

- over https, from `covers.openlibrary.org`, `archive.org` or any subdomain
  of it, or `books.google.com`, with no user name, password or explicit port
  in the URL (`allowedCoverUrl()`); anything else is refused before a request
  is sent;
- following at most three redirects by hand, each one checked against the
  same list before it is requested;
- within 10 seconds for the whole download, and up to 10 MB, checked against
  `Content-Length` and counted again while streaming (archive.org sends no
  `Content-Length`);
- keeping it only when its magic bytes say JPEG, PNG or WebP, and never
  Google's "image not available" placeholder.

A refused or failed download leaves no file and is logged in one line;
the book or edition is saved without the cover.

## SQL

SQL never interpolates a request value. Values are bound as parameters; table
and column names come from code:

- A book type in a URL must be `Books` or `EBooks`
  (`server/src/routes/books.js`), and the SQL uses the name from the code's
  own table, not the request's string.
- `/api/data/:table` accepts only the tables and columns listed in
  `server/src/routes/data.js`; an unknown table or column answers 400.
- `pickFields()` (`server/src/routes/fields.js`) takes column names from the
  caller's list and binds only strings, numbers, booleans (as 1 or 0) and
  null.

## Secrets

Secrets never go into the repository, onto a command line or into a commit
message. On the box they live in a root-only environment file loaded by the
systemd unit ([Deployment](deployment.md)).
