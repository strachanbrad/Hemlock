# Roadmap

The work planned for Hemlock. Foundation lands first and deployment after it;
lookup and the TV display follow, and the library (books, editions and the
phone layout, which land together) comes last. This page describes work that
does not exist yet, in the present-tense voice of the rest of the wiki; a step
leaves this page when it is built and is described on its own page. Nothing is
deployed, so a step may change the schema, the API or the file layout without
a compatibility path.

## 1. Foundation

- **One install.** npm workspaces (`client`, `server`) under the root
  `package.json`, one committed `package-lock.json`, a pinned Node release
  (`.nvmrc`) that dev and the box share.
- **Vite** builds and serves the client; its dev server proxies `/api` and
  `/covers` to Express and refuses to start on a busy port. Every dependency
  is on its current major, Ant Design included.
- **better-sqlite3** is the database driver: one connection, synchronous
  statements, `db.transaction` for multi-statement writes, WAL and
  `foreign_keys` set on the connection when it opens.
- **Migrations.** Numbered SQL files under `server/migrations/`, applied in
  order when the server starts, each in its own transaction, with the applied
  version recorded in the database. `npm run db:new <name>` writes the next
  file; `npm run db:reset` rebuilds the dev database from the seed data and
  refuses to touch a production data directory.
- **One data directory.** `DATA_DIR` holds `hemlock.db` and `covers/`;
  nothing tracked is written at runtime, and in production the checkout is
  read-only to the service.
- `GET /api/health` answers `{ ok, version, schema }` for the deploy script.
- The unused packages (`nodejs-web-scraper`, `quagga`, `node-fetch`,
  `method-override`, `cors`, the Create React App testing libraries) and the
  ISBNdb key and code are gone.

## 2. Deployment

- nginx serves the built client and the covers directory and proxies `/api`
  to the Express server, which runs under a systemd unit as its own user.
- The database and covers live under `/var/lib/hemlock`; a redeploy rebuilds
  the code and never touches them. The deploy script takes an online SQLite
  backup and a hardlink snapshot of the covers before restarting.
- `deploy/deploy.sh` is idempotent: build, back up, install the unit and the
  nginx site, restart, check `/api/health`, report.
- The owner's reverse proxy terminates TLS in front of nginx. HTTPS is a
  requirement, not an option: a phone browser grants camera access for
  barcode scanning only on a secure origin.

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

## 5. ISBN lookup and barcode scanning

- `GET /api/lookup/:isbn` asks Open Library, and Google Books when an API key
  is configured (its API refuses keyless requests), merges the answers field
  by field with an exact-ISBN match preferred over a same-work record, and
  returns one normalized record for the add form to prefill.
- The server downloads the chosen cover once into `DATA_DIR/covers/`, from an
  allow-list of hosts, after the edition is saved; a failed download never
  fails the save.
- Open Library's limits are respected: an identifying `User-Agent` with a
  contact address, at most one metadata request a second (three with the
  contact), covers fetched by cover id, answers cached for a day.
- The add page scans the barcode with the phone camera through the
  `barcode-detector` package (ZXing), with the WASM served from the app
  rather than a CDN. It accepts EAN-13 codes starting with `978` or `979`
  with a valid check digit, ignores the five-digit price supplement, and
  keeps manual ISBN entry as a fallback.

## 6. TV display

- `/display` is a full-viewport page with no navigation, laid out for a 16:9
  television and opened by any browser attached to it (a laptop over HDMI, a
  streaming stick's browser); an on-screen button requests fullscreen. A Roku
  TV has no browser of its own.
- The slideshow owns its own index and timer (no carousel component), derives
  the current slide from timestamps so a throttled timer cannot drift,
  preloads the next cover, and refreshes the library periodically.
- `GET /api/display` returns the slides' data; a Roku SceneGraph client
  sideloaded in developer mode can consume the same endpoint later.

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
