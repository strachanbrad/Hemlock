# Book lookup and barcode scanning

How Hemlock fills in a book from its ISBN. The server asks Open Library, and
Google Books when a key is configured, and merges the answers into one
record. When neither knows the ISBN and an Anthropic key is configured, the
page can ask Claude, which searches the web for a listing of the edition;
for a book already in the library, Claude can also look for a larger cover.
The client reads the ISBN from the book's barcode with the phone camera.
Every lookup and every cover download goes through the server; the only
image the browser loads from another host is the preview of a lookup's
cover ([Library § Add a book](library.md#add-a-book)).

Code: `server/src/lookup/` (the clients, the limiter, the merge and
`anthropic.js`), `server/src/routes/lookup.js`, `saveCoverFromUrl()` in
`server/src/covers.js`, `server/src/coverFinder.js`,
`client/src/components/BarcodeScanner.jsx`,
`client/src/components/IsbnField.jsx` and `client/src/api/lookup.js`.

The keys, the Claude model and the Open Library contact are settings: saved
on the admin page, or else taken from the environment
([Admin § Settings](admin.md#settings)). Every lookup reads them when it
starts, so a change applies without a restart.

## The endpoint

```
GET /api/lookup/:isbn
  200 { isbn, title, authors: [name], publisher, published, synopsis,
        format: 'hardcover' | 'paperback' | 'ebook' | null, cover_url,
        sources: { google, open_library, fields, anthropic } }
  400 { error }            not a valid ISBN-10 or ISBN-13
  404 { error, sources }   no source knows the ISBN
  502 { error, sources }   no source answered
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
- `sources.anthropic` is `available` when no source answered `ok` and a
  Claude key is set, and `disabled` otherwise. The 404 and 502 bodies carry
  `sources` (`google`, `open_library`, `anthropic`) for this; the page asks
  Claude after a 404 that says `available` ([Asking Claude](#asking-claude)).
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

Asked only when a Google Books key is set, on the admin page or in
`GOOGLE_BOOKS_API_KEY`
([Development setup § Configuration](dev-setup.md#configuration)). Without
the key `sources.google` is `disabled` and nothing is sent: Google refuses
keyless requests with a 429 and a daily quota of zero, so Open Library alone
is a fully supported mode. `createGoogle()` in `server/src/lookup/google.js`
asks in up to three requests:

1. **The search.**
   `https://www.googleapis.com/books/v1/volumes?q=isbn:<isbn13>&key=…`. The
   query also returns other editions of the work; only a volume whose
   `industryIdentifiers` hold the ISBN-13 or its ISBN-10 counts, and any
   other is ignored. An exact volume is the answer.
2. **Google Books Dynamic Links**, when the search answered without an exact
   volume. Google's search index misses many volumes it does hold (it
   answers `totalItems: 0` for ISBNs whose volume exists), so the ISBN is
   mapped to a volume id without the index:
   `https://books.google.com/books?bibkeys=ISBN:<isbn13>&jscmd=viewapi`,
   keyless. The answer is JavaScript, `var _GBSBookInfo = {...};`: the
   object after the assignment is JSON, keyed `ISBN:<isbn13>`, and its
   `info_url` carries the volume id as `id=`. An ISBN Google does not know
   answers `var _GBSBookInfo = {};`. An id that is not
   `[A-Za-z0-9_-]+` is never requested, and an answer that is not this
   script counts as not found and logs one line.
3. **The volume.** `https://www.googleapis.com/books/v1/volumes/<id>?key=…`,
   kept only when its `industryIdentifiers` hold the ISBN-13 or its ISBN-10:
   Dynamic Links also names volumes for ISBNs that are not theirs. Its
   `volumeInfo` is used exactly as a search hit's; the small Dynamic Links
   thumbnail is not.

The source is `ok` when step 1 or step 3 found the volume. A failed search
fails the source without asking further. After a search that answered, a
failed or empty Dynamic Links answer leaves the search's `not_found`; a
failed volume request after Dynamic Links named one fails the source, so the
next lookup asks again. Every request goes through the same timeouts,
retry and 403/429 pause as the search (Dynamic Links pauses on its own),
with the Hemlock `User-Agent`. The key is a query parameter, so no log line
ever contains a Google request URL.

### Claude

Asked only through its own endpoint, after the catalogues missed, and only
when an Anthropic key is set, on the admin page or in `ANTHROPIC_API_KEY`.
`createAnthropic()` in `server/src/lookup/anthropic.js` calls the Messages
API through the official SDK (`@anthropic-ai/sdk`), with the key and the
saved model (`claude-opus-5-5` by default), a 90-second timeout per request
and no automatic retry.

```
POST /api/lookup/:isbn/identify
  200 { isbn, title, authors, publisher, published, synopsis, format,
        cover_url, source_url, sources: { anthropic: 'ok', fields } }
  400 { error }   not a valid ISBN-10 or ISBN-13
  404 { error }   Claude found no listing that shows the ISBN
  502 { error }   the call failed; the message says why
  503 { error }   'Claude is not configured': no key is set
```

It asks Claude only, never Open Library or Google again.
`sources.fields.<field>` is `anthropic` for every field the answer has, and
`source_url` is the listing the fields were copied from.

**The request.** One request shape, sent at most three times per lookup:
the web search tool (`web_search_20260209`, at most 5 searches) and a
`report_book` tool, `tool_choice: auto`, `output_config: { effort: 'medium'
}`, `max_tokens` 8000. `report_book` is a tool whose input is the
answer (not a strict one: strict tools share structured outputs' limits,
which reject citations, and web search answers carry citations; `verdict()`
checks every field instead): `found`, `isbn_on_listing`, `title`, `authors`, `publisher`,
`published`, `format`, `synopsis`, `cover_url` and `source_url`, each null
when unknown. The request never sends `temperature`, `thinking` or a forced
`tool_choice`: `claude-opus-5-5` rejects the first and the last and always
thinks.

**The loop.** A `report_book` call ends it, and no tool result is sent
back. A turn that stops with `pause_turn` (the server-side search loop's
limit) is sent again with the assistant's turn appended and nothing else,
which resumes it. A turn that ends without the call gets one nudge, "Call
report_book now with what you found, or with found false.", and a second
such turn fails the lookup. A turn cut off by `max_tokens` or ended by a
`refusal` fails it without reading any partial call.

**The prompt.** The system prompt in `anthropic.js` tells Claude to
identify the exact edition: to search the ISBN-13 and its ISBN-10 as quoted
strings; to use the best listing (the publisher's page, Amazon, Goodreads,
Bookshop.org, Google Books, WorldCat, Barnes & Noble, the author's site);
to accept only a listing that shows this ISBN-13 or its ISBN-10 and report
that ISBN; to copy each field as the listing shows it: the authors as
printed, in order, without roles, the date as `YYYY`, `YYYY-MM` or
`YYYY-MM-DD`, the format from the binding, the publisher's description
rather than its own summary, trimmed to about 1,500 characters, and the
cover only as an image URL of the listing's main cover image, at the
largest size the listing offers; and to report
`found: false` when no listing matches, never guessing from a similar
title.

**What the server accepts.** The answer is checked whatever the model
said (`verdict()`):

- `found` false, or an `isbn_on_listing` that is not this ISBN-13 or its
  ISBN-10 once hyphens and spaces are removed, answers 404.
- `published` that is not a real `YYYY`, `YYYY-MM` or `YYYY-MM-DD` date
  becomes null; a `format` other than the three becomes null.
- Text is put in NFC and trimmed, and bounded: the title to 500
  characters, the publisher to 200, the synopsis to 4,000, the authors to
  10 names of 200.
- `source_url` must be https, without a user name or password; `cover_url`
  must pass `allowedCoverUrl()` ([Security § Downloads](security.md#downloads)),
  which adds Amazon's and Goodreads' image hosts for these covers. Either
  becomes null otherwise.
- An Amazon image URL (`m.media-amazon.com`, `images-na.ssl-images-amazon.com`
  or any subdomain of `images-amazon.com`) loses its size modifier, the
  `._<modifiers>_` part before the extension: `…/I/81abcXYZL._SY466_.jpg`
  becomes `…/I/81abcXYZL.jpg`, for which the CDN serves the original image,
  usually 1000 px or more on its long side (`largestCover()`). Other hosts'
  URLs are kept as sent.

**Cost.** Claude Opus 5.5 costs $4 per million input tokens and $20 per
million output tokens, and each web search adds its own charge; a lookup
with a few searches costs on the order of a few cents. The answer is cached
like a source's (below), so scanning a book, saving it and reopening the
form costs one call. A cheaper model can be chosen on the admin page.

### Asking Claude

`IsbnField` (`client/src/components/IsbnField.jsx`) asks Claude when the
lookup answers 404 with `sources.anthropic: 'available'`. It shows "Not in
the catalogues. Asking Claude…" with a spinner and posts to the identify
endpoint (`identifyIsbn()` in `client/src/api/lookup.js`); then "Found
“<title>” by <author>, via Claude from <host>." and the form fills in as for
any lookup, or "No catalogue or search knows <isbn>; fill in the details by
hand.", or the failure. A newer lookup, or leaving the page, drops the
answer when it arrives. The person can type or look up another ISBN while
Claude searches.

### Finding a better cover

A cover from a lookup can be small (Open Library's largest is about 300 px
wide, and for some books Google holds 300 px or only its 128 px thumbnail),
so a book's page has a button that asks Claude for the largest cover of
that edition on the web. It is never automatic: each
press is one search, a few cents, and nothing is cached.

```
POST /api/books/:id/cover/find      no body
  200 { replaced, book, source_url, width, height }
  404 { error }   'Book not found', or 'No cover found for this book'
  409 { error }   the book's cover changed during the search
  502 { error }   the search or the download failed; the message says why
  503 { error }   'Claude is not configured': no key is set
```

`createCoverFinder()` in `server/src/coverFinder.js` answers it:

1. **What the search is given.** The ISBN of the edition whose cover the
   book shows (the cover rule's order,
   [Library § The cover rule](library.md#the-cover-rule)), else the ISBN of
   any of its editions, else the book's title and author's name.
2. **The search.** `findCover()` in `anthropic.js` runs the same loop as a
   lookup (the same model, at most three requests of 90 seconds, the same
   handling of `pause_turn`, the nudge, `max_tokens` and a refusal) with the
   web search tool (at most 5 searches) and a `report_cover` tool:
   `found`, `cover_url`, `source_url` and `isbn_on_listing`. The prompt asks
   for the largest cover image of this exact edition on Amazon, Goodreads,
   the publisher's page, Bookshop.org or Barnes & Noble: the page's
   `og:image` or main product image, an Amazon image without its size
   modifier; a listing counts only when it shows the ISBN given or, without
   one, the exact title and author; otherwise `found: false`, never a
   similar edition's cover.
3. **What the server accepts** (`coverVerdict()`). With an ISBN, the
   listing's `isbn_on_listing` must be it or its ISBN-10. `cover_url` must
   pass `allowedCoverUrl()` and loses an Amazon size modifier, as for a
   lookup; a cover off the allow-list counts as not found. `source_url` is
   kept only when it is https.
4. **Wider or nothing.** The cover is downloaded with `saveCoverFromUrl()`
   ([Cover downloads](#cover-downloads)), so it is stored as every cover is,
   and its width is compared with the width of the file the book shows now,
   read with sharp (no cover, or a missing file, counts as 0). Not wider:
   the new file is deleted and the answer is `replaced: false`. Wider: it
   becomes the cover of the slot the cover rule reads first (that edition
   when the book has editions, else the book), the old file of that slot is
   discarded inside the `withCoverFiles()` transaction, and the answer is
   `replaced: true` with the whole book. `width` and `height` are the found
   image's as stored, at most 1600 px on its long side.
5. **A book that changed meanwhile.** The search takes up to a few minutes.
   When the book is deleted meanwhile the answer is 404; when its shown
   cover or that slot changed (an upload, a new edition with a cover), 409.
   Either way the downloaded file is deleted.

Concurrent presses for one book share one search. In the page
(`BookDetail.jsx`), **Find a better cover** sits with the book's buttons
for every book, says "Asking Claude…" while it waits, and then shows "Cover
replaced, from <host> (<width> × <height>)", "The current cover is already
the largest found", or the error as the server states it; the page shows
the book the server returns.

## Limits and courtesy

- **Rate.** Open Library allows 1 request a second, or 3 when the
  `User-Agent` names a contact. `server/src/lookup/limiter.js` spaces the
  start of every Open Library request, retries included, 1000 ms apart, or
  334 ms when a contact is set, across all lookups in the process.
  Google requests are not queued behind it.
- **Identification.** Every request, cover downloads included, sends
  `User-Agent: Hemlock/<version> (github.com/strachanbrad/hemlock[; <contact>])`.
  A repository URL does not count as a contact; an email address does. The
  contact is the one saved on the admin page, else `LOOKUP_CONTACT` from
  the environment, never the repository; the server refuses to start when
  `LOOKUP_CONTACT` is not an email address, and the admin page refuses one
  that is not.
- **Failures.** Each request has an 8 second timeout and one retry on a
  network error, a timeout or a 5xx; another 4xx is not retried. A 403 or
  429 pauses that source for its `Retry-After` (at most an hour) or for a
  minute, and while it is paused a lookup reports it `failed` without
  sending anything.
- **Cache.** A source's `ok` answer is kept in memory for 24 hours (at most
  500 entries), so scanning, saving and reopening a book costs one lookup. A
  miss, a failure, or a partial Open Library answer (its work request
  failed) is not kept, so the next lookup asks again. Concurrent lookups of
  one ISBN share their requests. Claude's answers follow the same rules in
  a cache of their own. A server restart empties both.
- **Credit.** A page that shows lookup data carries the line "Book data from
  Open Library", extended with "and Google Books" when `sources.google` is
  not `disabled`. A record from Claude is credited to its listing instead:
  "Book data from <host>, found by Claude", the host linking to
  `source_url` (`client/src/components/LookupCredit.jsx`).

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
  ignored. `-L` is the largest size Open Library serves.
- A Google thumbnail is used only from `books.google.com`, on https, with
  `edge=curl` (a painted page curl) removed and `fife=w1600` added. The
  thumbnail URL's `zoom=1` alone gives a 128 px wide image; with `fife`
  Google answers the largest cover it holds up to 1600 px wide (1600 or
  300 px for most books), and for a volume without a cover the same
  placeholder PNG as without it. For a volume Google holds page scans of,
  `fife` answers the scanned front page instead, often a title page, as a
  PNG; the download then falls back to the thumbnail
  ([Cover downloads](#cover-downloads)). The by-id `imageLinks` sizes are
  not used: they need the key and carry tokenized URLs.

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
  image hosts only (Amazon's and Goodreads' included, for Claude's covers), at most three redirects each re-checked, 10 seconds, and
  10 MB counted while streaming.
- The type comes from the magic bytes (`imageType()`), never from the URL or
  the `Content-Type`: an HTML error page behind a `.jpg` URL is refused.
- A `books.google.com` URL with `fife` that answers a PNG other than the
  placeholder has answered a scanned page, not the cover: the same URL
  without `fife` is downloaded instead, the cover's thumbnail, within the
  same 10 seconds (`googleThumbnailFor()`). Google's covers are JPEGs.
- Google answers a volume without a cover with a 1269-byte "image not
  available" PNG rather than a 404; that exact image (SHA-256
  `e3f8c414…eca12`) is refused, before it is decoded.
- The image is then stored as an upload is: `prepareCover()` decodes it and
  keeps a JPEG of at most 1600 px on its long side
  ([Library § Cover files](library.md#cover-files)), so a large Amazon
  original arrives at 1600 px and a 300 px Google image unchanged. An image
  that does not decode is a failed download.
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
`createLookup({ fetch, googleKey, contact, anthropicKey, now, sleep, timeoutMs, log })`,
`createAnthropic({ apiKey, model, fetch, timeoutMs, log })` and
`saveCoverFromUrl(url, base, { fetch, timeoutMs, userAgent, log })` take
their `fetch`, clock and logger from the caller (a key or contact may be a
value or a function read at each lookup), and
`server/test/support/fixtures.js` answers each upstream URL from a file in
`server/test/fixtures/lookup/`.

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
- `google/volumes-*.json` and `google/volume-<id>.json` are written by hand
  from the documented volume shape, since recording needs a key, and say so
  in `_source`. `google/dynamic-<isbn>.txt` are Dynamic Links answers
  recorded without a key, as Google sends them (JavaScript, so they carry no
  `_source`).
  `google/error-429.json` is Google's real keyless refusal and
  `google/placeholder.png` its real "image not available" image.
- `server/test/fixtures/anthropic/` holds Messages API answers written by hand from the
  documented shape (each says so in `_source`; the book in them is
  invented): a paused search, a `report_book` call, a turn without one,
  `found: false`, a refusal, a cut-off call and a 401, and for the cover
  search a `report_cover` call and its `found: false`.
  `server/test/anthropic.test.js` replays them through the client's
  injected `fetch` and checks each request it sends;
  `server/test/coverFinder.test.js` replays them behind
  `POST /api/books/:id/cover/find`, with the image host's answers built
  with sharp.
- `client/test/BarcodeScanner.test.jsx` mounts the scanner under StrictMode
  with a fake `getUserMedia` whose streams the test releases, so a stream that
  arrives after cleanup is covered.
