# Development setup

How to run Hemlock on a development machine: install, seed, run, test and
build. Every command on this page runs on the dev machine as your own user,
from the root of the checkout, unless it says otherwise.

## Requirements

- Node 26 and the npm that ships with it. `.nvmrc` names the release and the
  root `package.json` refuses older ones through `engines`.
- git.

Nothing else: the database driver (better-sqlite3) and the image library
that resizes covers (sharp, with libvips) ship prebuilt binaries, so there is
no compiler step, and no `sqlite3` command-line tool or system image library
to install.

## First run

1. Clone and install. One `npm install` at the root installs both workspaces
   (`client/` and `server/`) from the one root `package-lock.json`:

   ```bash
   git clone https://github.com/strachanbrad/Hemlock.git hemlock
   cd hemlock
   npm install
   ```

2. Build the dev library:

   ```bash
   npm run db:reset
   ```

   This applies the migrations to `data/hemlock.db`, loads
   `server/seed/seed.sql` and copies `server/seed/covers/` into
   `data/covers/`.

3. Start the server and the client together:

   ```bash
   npm run dev
   ```

   Express listens on `127.0.0.1:5000` and Vite on `http://localhost:5173`.
   Open `http://localhost:5173`; Vite proxies `/api` and `/covers` to Express.
   `/api/events` has a proxy entry of its own in `client/vite.config.js`:
   Vite's proxy streams it as it comes, but when Express restarts under
   `node --watch` it would keep the browser's end of the stream open with
   nothing behind it, so the entry cuts it and the page reconnects
   ([Library § Live updates](library.md#live-updates)).

## Layout

| Path | Holds |
|---|---|
| `client/` | The React and Ant Design client, built by Vite (`client/vite.config.js`, `client/index.html`, `client/src/`). |
| `client/src/api/` | The only modules that call `fetch`, one per resource. |
| `client/src/lib/isbn.js` | ISBN-10/13 validation and conversion; identical to `server/src/lib/isbn.js`. |
| `server/src/` | The Express server: `index.js` starts it, `app.js` builds it, `config.js` reads the environment, `db.js` opens the database, `migrate.js` applies migrations, `covers.js` downloads and deletes cover files, `coverFiles.js` writes uploads and ties cover files to transactions, `body.js` reads JSON and multipart bodies, `validate.js` checks every payload, `library.js` holds the book queries, `settings.js` keeps the settings and encrypts their secrets, `auth.js` holds the admin password and sessions ([Admin](admin.md)), `events.js` holds the live updates stream ([Library § Live updates](library.md#live-updates)), `routes/` holds one module per resource ([Library](library.md)). |
| `server/src/lookup/` | The Open Library, Google Books and Claude clients and the merge of the catalogues' answers ([Lookup](lookup.md)). |
| `server/migrations/` | The numbered SQL migrations ([Migrations](migrations.md)). |
| `server/seed/` | The dev library: `seed.sql` and `covers/`. |
| `server/scripts/` | The `db:migrate`, `db:new`, `db:reset`, `lookup:record` and `admin:password` commands. |
| `roku/` | The Roku channel: BrightScript and SceneGraph sources, fonts, and the scripts that build and install it ([Roku channel](roku.md)). |
| `data/` | The dev data directory (gitignored): `hemlock.db`, `covers/`, and `secrets.key` once a secret is saved. |
| `dist/` | The Roku package that `npm run roku:build` writes (gitignored). |

## Commands

All run from the root of the checkout.

| Command | Does |
|---|---|
| `npm run dev` | Starts Express with `node --watch` (it restarts when a file under `server/src/` or `server/migrations/` changes) and the Vite dev server, through `concurrently`. |
| `npm run build` | Builds the client into `client/dist/`. |
| `npm start` | Starts the server alone, without watching (`node server/src/index.js`). |
| `npm run lint` | ESLint over every first-party file (`eslint.config.js`), where any warning fails it, then `npm run roku:check`. |
| `npm test` | The server suite (`node:test`) and the client suite (Vitest); fails if either fails. |
| `npm run db:migrate` | Applies pending migrations to `DATA_DIR/hemlock.db` and prints the schema version. |
| `npm run db:new <name>` | Writes the next empty migration file ([Migrations](migrations.md)). |
| `npm run db:reset` | Rebuilds the dev library from `server/seed/` (below). |
| `npm run lookup:record -- <isbn>` | Asks Open Library for an ISBN, over the network, and writes its answers as test fixtures ([Lookup § Tests](lookup.md#tests)). |
| `npm run admin:password` | Sets the password of `/admin`, read from a hidden prompt or a pipe, and signs every browser out ([Admin § The password](admin.md#the-password)). |
| `npm run roku:build` | Builds the Roku channel into `dist/hemlock-roku.zip` for the address in `HEMLOCK_BASE_URL` ([Roku channel § Commands](roku.md#commands)). |
| `npm run roku:install` | Sideloads that package to the TV named by `ROKU_IP`, `ROKU_USERNAME` and `ROKU_PASSWORD`, which come from `~/.config/hemlock/rokudev.env` and never from the repository ([Roku channel § Developer mode and sideloading](roku.md#developer-mode-and-sideloading)). |
| `npm run roku:check` | Validates the channel's BrightScript and SceneGraph XML with BrighterScript. |

## Configuration

The server reads its settings from the environment (`server/src/config.js`);
there are no `.env` files.

| Variable | Default | Meaning |
|---|---|---|
| `DATA_DIR` | `<checkout>/data` | Holds `hemlock.db` and `covers/`; created if absent. A relative path resolves against the root of the checkout. Required when `NODE_ENV=production`. |
| `PORT` | `5000` | The server's port. Vite proxies to `http://127.0.0.1:$PORT`. |
| `HOST` | `127.0.0.1` | The server's bind address; an empty value also means `127.0.0.1`. |
| `NODE_ENV` | unset | `production` on the box ([Deployment](deployment.md)). |
| `GOOGLE_BOOKS_API_KEY` | unset | A Google Books API key, used when none is saved on the admin page. Without either, lookups ask Open Library only ([Lookup § Google Books](lookup.md#google-books)). A secret. |
| `ANTHROPIC_API_KEY` | unset | An Anthropic API key for the Claude lookup, used when none is saved on the admin page ([Lookup § Claude](lookup.md#claude)). A secret. |
| `LOOKUP_CONTACT` | unset | An email address for Open Library's `User-Agent`, which raises its limit from 1 to 3 requests a second; one saved on the admin page wins. The server refuses to start when it is not an email address. |
| `SECRETS_KEY` | unset | 64 hexadecimal characters that encrypt the secrets saved on the admin page; unset means `DATA_DIR/secrets.key` ([Admin § Secrets at rest](admin.md#secrets-at-rest)). The server refuses to start when it is malformed. A secret. |
| `VITE_PORT` | `5173` | The Vite dev server's port. |
| `HTTPS` | unset | `1` serves Vite over https on every interface, for testing on a phone (below). |

Set them as a prefix on the command, which both processes of `npm run dev`
inherit:

```bash
PORT=5101 VITE_PORT=5201 npm run dev
```

This is how two checkouts (a second clone or a `git worktree`) run side by
side: each gets its own pair of ports, and each has its own `data/`, since
`DATA_DIR` defaults to the checkout's own directory.

A busy port is an error, never a silent move:

- Vite refuses to start (`strictPort`), and `npm run dev` stops the server
  with it.
- The server prints `Cannot listen on 127.0.0.1:<port>` and exits 1. Under
  `npm run dev`, `node --watch` then waits for a file change instead of
  exiting; stop it with Ctrl-C and pick another `PORT`.

## Testing on a phone

A phone opens the camera only on a secure origin
([Lookup § Secure origin](lookup.md#secure-origin)), and the dev server
normally answers only `localhost`. With `HTTPS=1`, Vite serves https with a
self-signed certificate (`@vitejs/plugin-basic-ssl`) on every interface, so a
phone on the same network can reach it. Express stays on `127.0.0.1` behind
Vite's proxy.

1. On the dev machine, from the root of the checkout:

   ```bash
   HTTPS=1 npm run dev
   ```

   A worktree adds its own ports, for example
   `HTTPS=1 PORT=5102 VITE_PORT=5202 npm run dev`. Arguments after
   `npm run dev --` reach `concurrently`, not Vite, so `--host` does not work
   here; `HTTPS=1` is what opens the other interfaces.
2. Vite prints a `Network: https://<address>:<VITE_PORT>/` line for each
   interface. Pick the one on the Wi-Fi network (`ip -4 addr` names them).
3. On the phone, on the same Wi-Fi, open
   `https://<address>:<VITE_PORT>/add`.
4. Accept the certificate warning. Safari: "Show Details", then "visit this
   website", then "Visit Website". Chrome: "Advanced", then "Proceed to
   <address> (unsafe)". Firefox: "Advanced…", then "Accept the Risk and
   Continue". The certificate lasts 30 days; a new one brings the warning
   back.
5. Tap "Scan" beside the ISBN, allow the camera, and hold the barcode on the
   back of a book inside the frame. The form fills in from the lookup;
   nothing is saved until "Add book".

If the phone cannot connect, the dev machine's firewall must allow TCP on
`VITE_PORT` from the local network. Stop the server with Ctrl-C after testing:
while it runs, anyone on the network can reach the dev library.

## The dev data directory

`DATA_DIR` holds `hemlock.db` (with its `-wal` and `-shm` files while the
server runs), `covers/`, which Express serves at `/covers/` in dev, and
`secrets.key`, written by the first secret saved on the admin page. Nothing
tracked in the checkout is written at runtime.

`npm run db:reset` empties the database in place, applies the migrations,
loads `server/seed/seed.sql`, and replaces `DATA_DIR/covers/` with
`server/seed/covers/`. The settings go with the rest: run
`npm run admin:password` again to use `/admin`. Because it empties the file rather than deleting it, a
running `npm run dev` sees the reset library at once. It refuses to run:

- when `NODE_ENV=production`, always;
- when `DATA_DIR` resolves to anything but the checkout's `data/`, unless
  `--force` is given: `npm run db:reset -- --force`.

To start from nothing, stop the server and delete `data/`; the next start
creates an empty database with the current schema.

## Tests

- **Server:** `node:test` files in `server/test/*.test.js`, run with
  `node --test 'test/*.test.js'` (the quoted glob keeps the helpers in
  `server/test/support/` from running as tests). Each file runs in its own
  process on a temporary `DATA_DIR`; a test reaches the app's modules through
  `server/test/support/server.js`, because `config.js` reads `DATA_DIR` once,
  when it is first imported. One file: `node --test server/test/api.test.js`.
- **Client:** Vitest with jsdom and React Testing Library, files in
  `client/test/`. `client/test/setup.js` stubs `window.matchMedia` and
  `ResizeObserver`, which jsdom lacks and Ant Design calls. Vitest reads the
  `test` block of `client/vite.config.js`, so `?react` SVG imports resolve as
  in the app.
- One workspace: `npm test -w server` or `npm test -w client`.
- No test touches the network: the lookup and cover download tests answer
  from recorded fixtures ([Lookup § Tests](lookup.md#tests)).

jsdom does no layout: a layout or overflow problem passes these suites and
shows only in a real browser.
