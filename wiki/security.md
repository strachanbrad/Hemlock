# Security

The defaults every change to Hemlock keeps. Hemlock serves one household from
behind the owner's TLS-terminating reverse proxy, and is reachable from the
internet through it. Every page and every API route needs a signed-in user
or a paired television ([Sessions](#sessions)); the admin page holds the
lookup keys behind a password of its own ([Admin sessions](#admin-sessions)).
These rules keep a mistake in the client, a crafted request or a hostile
upload from reaching the database, the file system or another host.

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
  and `limits: { fileSize: 10 MB, files: 1, fields: 1, parts: 2 }`
  (`server/src/body.js`). A larger file answers 413; a second file or any part
  other than `data` and `cover` answers 400.
- The type comes from the file's magic bytes (`imageType()` in
  `server/src/covers.js`: JPEG, PNG or WebP), never from the client's file
  name or MIME type. Anything else answers 400.
- The file is decoded before anything is stored (`prepareCover()` in
  `server/src/covers.js`, sharp on libvips), bounded to 50 megapixels
  (`limitInputPixels`): a larger image, a decompression bomb included, is
  refused from its header before its pixels are decoded. A file that does
  not decode (truncated, corrupt) answers 400 "The cover could not be read
  as an image"; a failure inside the decoder is the same 400, never a
  crash.
- The stored cover is re-encoded without metadata, so a phone photo's EXIF,
  its location included, never reaches `DATA_DIR/covers/`. The one file kept
  byte for byte is a JPEG within 1600 px that carries no EXIF, XMP or IPTC
  ([Library § Cover files](library.md#cover-files)).
- The upload is written inside the database transaction it belongs to
  (`withCoverFiles()` in `server/src/coverFiles.js`): if the transaction
  throws, the file is removed, so a refused write leaves neither a row nor a
  file. A cover replaced or removed is deleted only after the commit.

## Cover file names

- The server generates every cover file name; a name from a request never
  reaches the file system. A cover is `e<edition id>-<8 hex>.jpg` or, for
  a book's own cover, `b<book id>-<8 hex>.jpg`: every stored cover is a
  JPEG. The random part gives a replaced cover a new URL.
- `writeCover()` (`server/src/coverFiles.js`) writes an upload under that
  name with the `wx` flag, so it never replaces an existing file. A
  downloaded cover (`saveCoverFromUrl()`) goes to a temporary name inside
  `DATA_DIR/covers/` and is renamed into place, never from `os.tmpdir()`:
  under the systemd unit's `PrivateTmp` that is another mount, and the rename
  fails with `EXDEV`.
- `deleteCover()` refuses any name that does not match the server's own
  pattern (`COVER_NAME` in `server/src/covers.js`,
  `^[eb][1-9]\d*-[0-9a-f]{8}\.(jpg|png|webp)$`; `png` and `webp` for the
  files stored before every cover became a JPEG) and ignores a file that is
  already gone.

## Downloads

Book lookups go through the server, which calls only Open Library, Google
Books, the Barnes & Noble and Amazon cover probes (one `HEAD` request each,
to fixed URLs built from the ISBN) and, through its SDK, the Anthropic API
([Lookup](lookup.md)). The one request the browser makes to another host is
the preview of a lookup's cover on the add and edition forms: an `<img>`
from that source's image host (Open Library's cover server redirects to
archive.org; Barnes & Noble's is `cdn.shopify.com`), sent with
`referrerpolicy="no-referrer"` so the page address is not passed on.
A cover chosen from a lookup reaches the server as a URL from the client, so
without bounds the server would fetch whatever a request names, a loopback or
LAN address included. `saveCoverFromUrl()` (`server/src/covers.js`) fetches
a cover only:

- over https, from `covers.openlibrary.org`, `archive.org` or any subdomain
  of it, `books.google.com`, Barnes & Noble's image hosts
  (`cdn.shopify.com`, its Shopify CDN, and `prodimage.images-bn.com`),
  Amazon's (`m.media-amazon.com`, `images-na.ssl-images-amazon.com` and any
  subdomain of `images-amazon.com`), AbeBooks' (`pictures.abebooks.com`) and
  Goodreads' (`i.gr-assets.com`, `images.gr-assets.com`), with no user name,
  password or explicit port in the URL (`allowedCoverUrl()`); the validator
  answers 400 for anything else, before the row is saved or a request is
  sent. `cdn.shopify.com` serves every Shopify store's images, not only
  Barnes & Noble's; that is harmless, since anything fetched from it is
  sniffed, capped, decoded and re-encoded like any cover;
- following at most three redirects by hand, each one checked against the
  same list before it is requested;
- within 10 seconds for the whole download, and up to 10 MB, checked against
  `Content-Length` and counted again while streaming (archive.org sends no
  `Content-Length`);
- keeping it only when its magic bytes say JPEG, PNG or WebP, it is not
  Google's "image not available" placeholder, and it decodes within the
  upload's limits (above), re-encoded the same way.

A refused or failed download leaves no file and is logged in one line;
the book or edition is saved without the cover.

## Live updates

`GET /api/events` ([Library § Live updates](library.md#live-updates)) tells
every open page only that the library changed: the stream carries the one
event `changed` with `{"kind":"library"}`, never an id, a title or any field,
so a page learns nothing from it that it could not fetch, and it is sent only
after a write that succeeded. The long poll, `GET /api/changes`, answers only
a version number. Each open stream and each held poll holds a socket, so
`createEvents()` (`server/src/events.js`) caps them together at 50 and
answers 503 past that; a page that is refused or closed tries again after 5
seconds. A poll holds for at most 30 seconds, whatever `wait` asks. Both are
behind the guard like every API route ([Sessions](#sessions)): `EventSource`
sends the page's cookie, and the Roku channel's long poll sends its token.

## SQL

SQL never interpolates a request value. Values are bound as parameters; table
and column names come from code:

- Every request body passes `server/src/validate.js` first: an unknown field
  answers 400, and every value leaves it in its stored type (booleans as 1
  or 0, ISBNs as ISBN-13, names trimmed).
- An `UPDATE` names only columns from the lists in `server/src/library.js`,
  picked by the validated payload's keys.
- A `q` search is bound as a `LIKE` pattern with `%`, `_` and `\` escaped.

A Claude lookup's answer is model output and is treated as untrusted: the
server keeps it only when the listing shows the ISBN, bounds every field,
and passes its cover URL through the same allow-list
([Lookup § Claude](lookup.md#claude)). A cover search's answer is checked
the same way, and its image replaces a cover only after it has been
downloaded, decoded and found wider
([Lookup § Finding a better cover](lookup.md#finding-a-better-cover)).

## Raw markup

The display's blood and chilli are the one place the site renders markup as
it is: `CoverEffects.jsx` hands the SVG that `bloodMarkup` and `chilliMarkup`
in `client/src/pages/Display/effects.js` build to `dangerouslySetInnerHTML`,
and that markup is made from numbers and the page's own ids only, never from
a book's text. Nothing else on the site renders raw markup; every title,
author and synopsis reaches the page as text.

## Sessions

Code: `server/src/routes/session.js` (the login, the logout, the session
check and the guard), `server/src/users.js`, `server/src/devices.js`,
`server/src/auth.js` (hashing, tokens, the lockout, the cookies).

- **Users.** One kind: every user sees and edits everything
  ([Admin § Users](admin.md#users)). A password is stored as a scrypt hash
  and checked with `timingSafeEqual`; a name that does not exist still
  costs one scrypt, so the answer's timing does not say which names exist.
  The first user is added on the command line, never by a first visit.
- **The login.** `POST /api/login { name, password }` answers 200
  `{ name }` (the name as stored) with the cookie, 401 `{ error: 'Wrong name
  or password' }` whichever was wrong, 400 without both fields, and 503
  `{ error: 'No user exists yet; run npm run user:add on the server' }`
  while the `users` table is empty. Five failures within 15 minutes for one
  name, or from one client address, answer 429 with `Retry-After` for the
  rest of the window, even for the right password; a right password clears
  both counts. The counts are in memory, and behind nginx every request
  comes from `127.0.0.1`, so there the address count is one count for the
  whole box: someone on the internet can keep the household from signing
  in for 15 minutes, but cannot keep guessing, and browsers already signed
  in are not affected. A login with a session cookie already present ends
  that session first.
- **The cookie** `hemlock_session` holds 32 random bytes; the
  `user_sessions` table keeps only their SHA-256, the user and an expiry.
  It is `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 180 days and
  `Secure` when `NODE_ENV=production` (as the admin cookie, below). Lax,
  not Strict, so a link to a book opened from a message or another site
  still carries it; a cross-site request that is not a top-level `GET`
  carries no cookie, and every `GET` reads only. A session lasts 180 days
  from its last renewal: a request renews it at most once a day, moving
  the expiry to 180 days from then and sending the cookie again with a
  fresh `Max-Age`, so a browser in use stays signed in and one left alone
  for 180 days is signed out. A login deletes the expired rows.
- **The session check and the logout.** `GET /api/session` answers
  `{ name }` or 401. `POST /api/logout` answers 204, deletes the row and
  clears the cookie, signed in or not. Setting a user's password or
  removing the user deletes every session they hold.
- **The guard** (`signInGuard()`, mounted on `/api` in
  `server/src/app.js` ahead of every router and of the live updates
  trigger, so a route added later is guarded by default). A request passes
  when its `hemlock_session` cookie names a live session, or its
  `Authorization: Bearer <token>` names a paired television. Only these
  pass without either: `GET /api/health`, `POST /api/login`,
  `POST /api/logout`, `POST /api/devices/pair`,
  `GET /api/devices/pair/<poll>`, and everything under `/api/admin`, which
  has its own gate. Anything else, an unknown path included, answers 401
  `{ error: 'Sign in' }` before a router runs, so a refused write changes
  nothing and tells no page. The paths are compared exactly: another case
  or a trailing slash is not an exception, and answers 401.
- **Televisions.** A TV's token is 32 random bytes given once, in the one
  poll answer that ends its pairing ([Admin § Televisions](admin.md#televisions));
  the `devices` table keeps only its SHA-256. It never appears in any other
  answer, an error or a log line. Removing the TV on the admin page ends
  it. Pairing needs the admin password; the code alone is worth nothing.
- **Covers are public by design.** `/covers/` is not under `/api`: nginx
  serves the files without asking Express, and the TV's image loader sends
  no credentials. Every cover name carries 8 random hex digits
  ([Cover file names](#cover-file-names)) and no answer outside a session
  lists one, so a cover is reachable only by someone who already saw its
  address.
- **The client.** The shell checks `GET /api/session` once when it loads,
  and a 401 from any later request sends the visitor to the login page
  once ([Library § Signing in](library.md#signing-in)).

### Admin sessions

`/admin` and `/api/admin/*` ([Admin](admin.md)), after a user's session:

- **The password** is set only from the command line, never by a first
  visit, and read from standard input, never an argument. The database
  keeps a scrypt hash, itself encrypted as a secret (below). Five wrong
  passwords within 15 minutes lock the login for the rest of the window
  (429 with `Retry-After`), for the whole process: someone on the network
  can lock the owner out for 15 minutes, but cannot keep guessing.
- **The cookie** `hemlock_admin` holds 32 random bytes; the database keeps
  only their SHA-256, with an expiry fixed 30 days after login. It is
  `HttpOnly` (no script reads it), `SameSite=Strict` (no request from
  another site carries it), `Path=/api/admin` (no other request carries it)
  and `Secure` when `NODE_ENV=production`. Production always sits behind the
  owner's TLS proxy, and the legs from the proxy to nginx to Express are
  plain HTTP, so Express cannot see TLS itself; the variable says so. A
  `Secure` cookie is never sent over plain HTTP, which is why it is off in
  development.
- **Every admin route** but login, logout and the session check answers 401
  before it reads or changes a setting.
- **Cross-site requests.** `SameSite=Strict` keeps the cookie off them, the
  admin routes read only JSON bodies (a cross-site form can send only form
  or plain-text bodies, which `express.json()` leaves unread), and the
  server sends no CORS headers, so another site's script cannot read an
  answer.
- **Setting the password again** deletes every session.

The identify endpoint and the cover search, each of which can cost a few
cents of the owner's Anthropic credit, are behind a user's session like
the rest of the API.

## Secrets

Secrets never go into the repository, onto a command line or into a commit
message. On the box they live in a root-only environment file loaded by the
systemd unit ([Deployment](deployment.md)), or in the database, entered on
the admin page.

- **At rest.** A secret saved on the admin page (a key, the password hash)
  is stored AES-256-GCM encrypted under `SECRETS_KEY`, or under
  `DATA_DIR/secrets.key` (mode 0600) when that is not set
  ([Admin § Secrets at rest](admin.md#secrets-at-rest)). The database alone,
  a copy of it included, does not reveal a key.
- **In answers.** The settings API answers a secret as its status and last
  four characters, never its value. A test button's error carries the
  provider's message with the key replaced by `[redacted]`; the Claude
  lookup's errors and log lines are redacted the same way.
- **In logs.** The Google key is a query parameter, so no log line contains
  a Google request URL; the Anthropic SDK runs with its own logging off.
