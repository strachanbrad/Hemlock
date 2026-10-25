# Development setup

How to run Hemlock on a development machine: install, seed, run, test and
build. Every command on this page runs on the dev machine as your own user,
from the root of the checkout, unless it says otherwise.

## Requirements

- Node 26 and the npm that ships with it. `.nvmrc` names the release and the
  root `package.json` refuses older ones through `engines`.
- git.

Nothing else: the database driver (better-sqlite3) ships a prebuilt binary, so
there is no compiler step and no `sqlite3` command-line tool to install.

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

## Layout

| Path | Holds |
|---|---|
| `client/` | The React and Ant Design client, built by Vite (`client/vite.config.js`, `client/index.html`, `client/src/`). |
| `client/src/api/` | The only modules that call `fetch`, one per resource. |
| `client/src/lib/isbn.js` | ISBN-10/13 validation and conversion; identical to `server/src/lib/isbn.js`. |
| `server/src/` | The Express server: `index.js` starts it, `app.js` builds it, `config.js` reads the environment, `db.js` opens the database, `migrate.js` applies migrations, `covers.js` writes and deletes cover files, `routes/` holds one module per resource. |
| `server/migrations/` | The numbered SQL migrations ([Migrations](migrations.md)). |
| `server/seed/` | The dev library: `seed.sql` and `covers/`. |
| `server/scripts/` | The `db:migrate`, `db:new` and `db:reset` commands. |
| `data/` | The dev data directory (gitignored): `hemlock.db` and `covers/`. |

## Commands

All run from the root of the checkout.

| Command | Does |
|---|---|
| `npm run dev` | Starts Express with `node --watch` (it restarts when a file under `server/src/` or `server/migrations/` changes) and the Vite dev server, through `concurrently`. |
| `npm run build` | Builds the client into `client/dist/`. |
| `npm start` | Starts the server alone, without watching (`node server/src/index.js`). |
| `npm run lint` | ESLint over every first-party file (`eslint.config.js`); any warning fails it. |
| `npm test` | The server suite (`node:test`) and the client suite (Vitest); fails if either fails. |
| `npm run db:migrate` | Applies pending migrations to `DATA_DIR/hemlock.db` and prints the schema version. |
| `npm run db:new <name>` | Writes the next empty migration file ([Migrations](migrations.md)). |
| `npm run db:reset` | Rebuilds the dev library from `server/seed/` (below). |

## Configuration

The server reads its settings from the environment (`server/src/config.js`);
there are no `.env` files.

| Variable | Default | Meaning |
|---|---|---|
| `DATA_DIR` | `<checkout>/data` | Holds `hemlock.db` and `covers/`; created if absent. A relative path resolves against the root of the checkout. Required when `NODE_ENV=production`. |
| `PORT` | `5000` | The server's port. Vite proxies to `http://127.0.0.1:$PORT`. |
| `HOST` | `127.0.0.1` | The server's bind address; an empty value also means `127.0.0.1`. |
| `NODE_ENV` | unset | `production` on the box ([Deployment](deployment.md)). |
| `VITE_PORT` | `5173` | The Vite dev server's port. |

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

## The dev data directory

`DATA_DIR` holds `hemlock.db` (with its `-wal` and `-shm` files while the
server runs) and `covers/`, which Express serves at `/covers/` in dev. Nothing
tracked in the checkout is written at runtime.

`npm run db:reset` empties the database in place, applies the migrations,
loads `server/seed/seed.sql`, and replaces `DATA_DIR/covers/` with
`server/seed/covers/`. Because it empties the file rather than deleting it, a
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

jsdom does no layout: a layout or overflow problem passes these suites and
shows only in a real browser.
