# Book lookup and barcode scanning

How Hemlock fills in a book from its ISBN. The server asks Open Library, and
Google Books when a key is configured, and merges the answers into one
record; the client reads the ISBN from the book's barcode with the phone
camera. Every lookup and every cover download goes through the server; the
only image the browser loads from another host is the preview of a lookup's
cover ([Library § Add a book](library.md#add-a-book)).

Code: `server/src/lookup/` (the clients, the limiter and the merge),
`server/src/routes/lookup.js`, `saveCoverFromUrl()` in
`server/src/covers.js`, `client/src/components/BarcodeScanner.jsx` and
`client/src/api/lookup.js`.

## The endpoint

```
GET /api/lookup/:isbn
  200 { isbn, title, authors: [name], publisher, published, synopsis,
        format: 'hardcover' | 'paperback' | 'ebook' | null, cover_url,
        sources: { google, open_library, fields } }
  400 { error }   not a valid ISBN-10 or ISBN-13
  404 { error }   no source knows the ISBN
  502 { error }   no source answered
```

- `:isbn` is an ISBN-10 or ISBN-13; hyphens, spaces and an `ISBN` label are
  allowed. `toIsbn13()` (`server/src/lib/isbn.js`) converts it, and anything
  it rejects (a bad check digit, an EAN-13 without the `978` or `979`
  prefix) answers 400 before any source is asked. The answer's `isbn` is the
  ISBN-13.
- `sources.google` and `sources.open_library` are each `ok`, `not_found`,
  `failed` or `disabled`. `sources.fields` names the source of every field
  the answer has: `google`, `open_library`, or `open_library_work` when the
  value comes from the work record rather than this edition (the same book,
  possibly another edition's cover or text). `sources.fields.synopsis` is
  `failed` when the synopsis is null because Open Library's work request
  failed and no other source had one; the rest of the answer stands.
- The status is 200 when any source is `ok`, even if the other failed; 502
  when none is `ok` and at least one `failed`; 404 otherwise.
- A field no source has is `null`; `authors` is then `[]`.
- `format` is a hint for the form. Open Library's `physical_format` is free
  text and sometimes wrong, and Google has no binding at all; a form never
  preselects `ebook` for a scanned barcode, since the person is holding a
  printed book.
- `cover_url` is the upstream image. Nothing is downloaded until a book or
  edition is saved with it ([Cover downloads](#cover-downloads)).

## Sources

### Open Library

Asked on every lookup, in at most three requests and never a redirect:

1. `https://openlibrary.org/search.json?q=isbn:<isbn13>&fields=…` gives the
   work key, title, author names and cover id, and the edition the search
   matched. The edition is used only when its own `isbn` list holds the
   ISBN-13 or its ISBN-10; otherwise only the work is.
2. `/books/<edition key>.json` gives `physical_format`, `description`,
   `publishers`, `publish_date` and `covers`.
3. `/works/<work key>.json` gives the work's `description`. It is skipped
   when the edition already has one. When it fails, the source is still
   `ok` with what the search and the edition gave, and the answer is
   partial. A failed search or edition request fails the source.

A key from an answer becomes a request only when it has the shape
`/books/OL…M` or `/works/OL…W`. A merged record (`/type/redirect`) counts as
missing.

### Google Books

Asked only when `GOOGLE_BOOKS_API_KEY` is set
([Development setup § Configuration](dev-setup.md#configuration)):
`https://www.googleapis.com/books/v1/volumes?q=isbn:<isbn13>&key=…`. Without
the key `sources.google` is `disabled` and nothing is sent: Google refuses
keyless requests with a 429 and a daily quota of zero, so Open Library alone
is a fully supported mode. The query also returns other editions of the work;
only a volume whose `industryIdentifiers` hold the ISBN-13 or its ISBN-10
counts, and any other is ignored. The key is a query parameter, so no log
line ever contains a Google request URL.

## Limits and courtesy

- **Rate.** Open Library allows 1 request a second, or 3 when the
  `User-Agent` names a contact. `server/src/lookup/limiter.js` spaces the
  start of every Open Library request, retries included, 1000 ms apart, or
  334 ms when `LOOKUP_CONTACT` is set, across all lookups in the process.
  Google requests are not queued behind it.
- **Identification.** Every request, cover downloads included, sends
  `User-Agent: Hemlock/<version> (github.com/strachanbrad/hemlock[; <LOOKUP_CONTACT>])`.
  A repository URL does not count as a contact; an email address does.
  `LOOKUP_CONTACT` lives in the environment, never in the repository, and
  the server refuses to start when it is not an email address.
- **Failures.** Each request has an 8 second timeout and one retry on a
  network error, a timeout or a 5xx; another 4xx is not retried. A 403 or
  429 pauses that source for its `Retry-After` (at most an hour) or for a
  minute, and while it is paused a lookup reports it `failed` without
  sending anything.
- **Cache.** A source's `ok` answer is kept in memory for 24 hours (at most
  500 entries), so scanning, saving and reopening a book costs one lookup. A
  miss, a failure, or a partial Open Library answer (its work request
  failed) is not kept, so the next lookup asks again. Concurrent lookups of
  one ISBN share their requests. A server restart empties the cache.
- **Credit.** A page that shows lookup data carries the line "Book data from
  Open Library", extended with "and Google Books" when `sources.google` is
  not `disabled`.

## Merging

`merge()` in `server/src/lookup/merge.js` is a pure function of the two
sources' answers. For each field the first non-empty value wins; "exact"
means a Google volume carrying the ISBN.

| Field | 1st | 2nd | 3rd |
|---|---|---|---|
| `title` | Google exact `title` | Open Library edition `title` | Open Library work `title` |
| `authors` | Google exact `authors` | Open Library search `author_name` | |
| `synopsis` | Google exact `description` | Open Library edition `description` | Open Library work `description` |
| `publisher` | Google exact `publisher` | Open Library edition `publishers[0]` | |
| `published` | Google exact `publishedDate` | Open Library edition `publish_date` | |
| `format` | Open Library edition `physical_format` | | |
| `cover_url` | Open Library edition cover | Google exact `imageLinks.thumbnail` | Open Library work cover |

Normalisation:

- Text is put in Unicode NFC (Open Library sends some names decomposed, which
  would not match the same name typed), runs of whitespace become one space,
  and the ends are trimmed. A subtitle is never appended to the title.
  Repeated author names are dropped.
- A description is a string or `{ value }`. CRLF becomes LF, three or more
  newlines become two, and the result is trimmed. Google's HTML loses its
  tags: `<br>` becomes a newline, a paragraph end a blank line, and
  entities are decoded.
- `published` is `YYYY`, `YYYY-MM` or `YYYY-MM-DD` when the date parses
  (`February 21, 2006` gives `2006-02-21`, `July 2004` gives `2004-07`);
  otherwise its four-digit year (`16/06/2024` gives `2024`); otherwise null.
- `format` maps case-insensitively: `hardcover`, `hardback` or `library
  binding` give `hardcover`; `paperback`, `mass market`, `trade paper`,
  `softcover` or `perfect` give `paperback`; `ebook`, `e-book`, `kindle`,
  `epub` or `digital` give `ebook`; anything else gives null.
- An Open Library cover is `https://covers.openlibrary.org/b/id/<id>-L.jpg`,
  built from a cover id, never from the ISBN: covers by id are not rate
  limited, covers by ISBN are (100 per 5 minutes). Ids of zero or below are
  ignored. A Google thumbnail is used only from `books.google.com`, on https,
  with `edge=curl` (a painted page curl) removed.

## Cover downloads

`saveCoverFromUrl(url, base)` in `server/src/covers.js` downloads a cover the
person chose from a lookup, once, after the book or edition row is saved:
the database transaction is synchronous and cannot wait for a download.
`attachDownloadedCovers()` in `server/src/coverFiles.js` calls it after the
commit and points the row at the file in a second statement
([Library § Cover files](library.md#cover-files)).

- `base` is `'e<edition id>'` or `'b<book id>'`, as for an upload, giving
  `e<id>-<8 hex>.<ext>` or `b<id>-<8 hex>.<ext>`. Anything else throws a
  `TypeError`: that is a bug in the caller, not an upstream problem.
- It resolves to the new file name, or to `null` after logging one line
  (`Cover not saved from <host>: <reason>`) when anything fails. It never
  rejects for an upstream problem, so a caller treats `null` as "saved
  without the cover".
- The URL comes from the client, so the download is bounded by the rules in
  [Security § Downloads](security.md#downloads): https only, the sources'
  image hosts only, at most three redirects each re-checked, 10 seconds, and
  10 MB counted while streaming.
- The type comes from the magic bytes (`imageType()`), never from the URL or
  the `Content-Type`: an HTML error page behind a `.jpg` URL is refused.
- Google answers a volume without a cover with a 1269-byte "image not
  available" PNG rather than a 404; that exact image (SHA-256
  `e3f8c414…eca12`) is refused.
- The file is written to a temp name inside `DATA_DIR/covers/` and renamed
  into place ([Security § Cover file names](security.md#cover-file-names)).

## Barcode scanning

`client/src/components/BarcodeScanner.jsx` takes `onDetected(isbn13)` and an
optional `autoStart`.

- **Opening the camera.** The camera opens when the person taps "Scan
  barcode", with `getUserMedia({ video: { facingMode: { ideal: 'environment'
  } }, audio: false })`. `ideal` prefers the rear camera and falls back to any
  other; `exact` would fail outright on a laptop. With `autoStart` the camera
  opens at mount, for a scanner that a tap mounts (in a modal, say).
- **Playing the video.** `<video playsInline muted autoPlay>`: an iPhone
  plays video inline only with `playsinline`, and a muted stream may play
  without a gesture.
- **Detecting.** `barcode-detector/ponyfill` (ZXing compiled to WASM) with
  `formats: ['ean_13']` looks at the video about every 150 ms once it has a
  frame (`readyState >= 2`; before that `detect()` throws). The five-digit
  price add-on beside an ISBN barcode is ignored. Only a code that
  `isValidIsbn13()` accepts counts, so a grocery or magazine EAN-13 is
  skipped. The first ISBN found is reported once, after every camera track
  has stopped.
- **Stopping.** The tracks stop on success, on "Stop scanning" and on
  unmount, including a stream that arrives after the component has cleaned
  up (React's StrictMode runs every effect twice in development).
- **Typed entry.** An ISBN field (ISBN-10 or ISBN-13) replaces the camera when
  `navigator.mediaDevices` is missing (an insecure origin), when the person
  refuses the camera, when no camera exists, or when `detect()` throws
  `NotSupportedError` (the WASM did not load).
- **The ponyfill, not the polyfill.** Chrome on Android has a native
  `BarcodeDetector` that would behave differently from the ZXing detector
  every other browser uses; the ponyfill uses ZXing everywhere.

### The WASM

- The ZXing reader (`zxing-wasm/reader/zxing_reader.wasm`) is imported with
  Vite's `?url` and handed to `prepareZXingModule({ overrides: { locateFile }
  })` when the module loads, before any `BarcodeDetector` exists:
  constructing one starts the download, and without the override the glue
  fetches the file from jsDelivr.
- `zxing-wasm` is pinned in `client/package.json` to the exact version
  `barcode-detector` expects. `client/test/zxing.test.js` fails when the
  installed version or the binary's SHA-256 differs from the glue's
  `ZXING_WASM_VERSION` and `ZXING_WASM_SHA256`; upgrade the two packages
  together.
- The build emits `client/dist/assets/zxing_reader-<hash>.wasm` (947 KB,
  414 KB compressed). A phone downloads it on its first scan and caches it.
  It is served as `application/wasm`, which nginx gzips (`gzip_types` in
  `deploy/nginx/hemlock.conf`); a wrong type is not fatal, since the glue
  falls back to instantiating from an ArrayBuffer. A
  Content-Security-Policy in front of the app needs `'wasm-unsafe-eval'` in
  `script-src`.

### Secure origin

A browser exposes the camera only on a secure origin: elsewhere
`navigator.mediaDevices` is undefined. `localhost` counts as secure, so the
dev machine's own browser scans over plain http. A phone needs https: the
owner's TLS proxy in production ([Deployment](deployment.md)), and the dev
server's `HTTPS=1` mode on the LAN
([Development setup § Testing on a phone](dev-setup.md#testing-on-a-phone)).

### Where it is used

The add page and the edition form (adding an edition, marking a book
purchased) put a Scan button beside the ISBN field (`IsbnField.jsx`), which
loads the scanner the first time it is tapped and shows it in a dialog
([Library § Add a book](library.md#add-a-book)).

## Tests

The lookup and download tests never touch the network.
`createLookup({ fetch, googleKey, contact, now, sleep, timeoutMs, log })` and
`saveCoverFromUrl(url, base, { fetch, timeoutMs, log })` take their `fetch`,
clock and logger from the caller, and `server/test/support/fixtures.js`
answers each upstream URL from a file in `server/test/fixtures/lookup/`.

- `openlibrary/` holds real answers, recorded and trimmed to the fields used.
  To record an ISBN, run on the dev machine, from the root of the checkout,
  with network access:

  ```bash
  npm run lookup:record -- 9780553212587
  ```

  It goes through the same limiter and `User-Agent` as the server, writes one
  file per request (each says when it was recorded in `_source`) and prints
  the merged answer. With `GOOGLE_BOOKS_API_KEY` set it records Google's
  answer too.
- `google/volumes-*.json` are written by hand from the documented volume
  shape, since recording needs a key, and say so in `_source`.
  `google/error-429.json` is Google's real keyless refusal and
  `google/placeholder.png` its real "image not available" image.
- `client/test/BarcodeScanner.test.jsx` mounts the scanner under StrictMode
  with a fake `getUserMedia` whose streams the test releases, so a stream that
  arrives after cleanup is covered.
