# Migrations

How the database schema changes: numbered SQL files, applied in order, each in
its own transaction. The tables themselves are whatever the files in
`server/migrations/` create.

## Files

`server/migrations/NNN_short_description.sql`: a three-digit version, an
underscore, and a description in lowercase letters, digits and underscores.
`server/src/migrate.js` refuses a `.sql` file named any other way and two files
with the same version. Each file starts with the SQL license header
(`-- Copyright (c) 2023 Hemlock`, `-- SPDX-License-Identifier: GPL-3.0-only`).

## When they run

- On every server start: `server/src/index.js` calls `openDb()` in
  `server/src/db.js`, which opens `DATA_DIR/hemlock.db`, sets the connection
  pragmas, and calls `migrate()`.
- On `npm run db:migrate`, which does the same and prints the schema version.
- On `npm run db:reset`, after it empties the database ([Development
  setup](dev-setup.md#the-dev-data-directory)).

Under `npm run dev`, a new file in `server/migrations/` restarts the server,
which applies it.

## What `migrate()` does

1. Creates `schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT
   NULL, applied_at TEXT NOT NULL)` if it does not exist.
2. Refuses to go on, before it applies anything, when the highest version in
   `schema_migrations` is newer than the newest file: a later checkout
   migrated the database, and this one does not know its schema. The error
   is `Database is at schema N, newer than this checkout's migrations (M);
   restore a backup (wiki/deployment.md#restore)`, and the server does not
   start. In production, restore the backup taken before the newer version
   was deployed ([Deployment § Restore](deployment.md#restore)); on the dev
   machine, run `npm run db:reset`, which drops the newer schema first.
3. For each file whose version is not in `schema_migrations`, in filename
   order:
   1. sets `PRAGMA foreign_keys = OFF` (outside any transaction, the only
      place it takes effect);
   2. `BEGIN`, runs the file, runs `PRAGMA foreign_key_check`, inserts the
      `schema_migrations` row (`name` is the file name, `applied_at` an ISO
      timestamp), `COMMIT`;
   3. sets `PRAGMA foreign_keys = ON` again, whether the file succeeded or
      not.
4. Returns the highest applied version, which `GET /api/health` reports as
   `schema`.

If the file fails, or `foreign_key_check` returns any row, the transaction
rolls back, the version stays unapplied, and the error stops the server from
starting (or `db:migrate` from finishing).

`foreign_keys` is off during a migration because the usual SQLite table
rebuild (create the new table, copy the rows, drop the old one, rename) would
otherwise cascade: dropping a parent table with `foreign_keys` on deletes every
child row that references it with `ON DELETE CASCADE`. The
`foreign_key_check` before `COMMIT` keeps the rebuild from leaving a dangling
reference.

## Rules

- **Append-only, no down migrations.** Once a migration has been applied in
  production it never changes; a correction is the next numbered file.
- **SQL only, against its own shape.** A migration sees the tables as the
  migrations before it left them; it never calls application code.
- **No PRAGMA.** `migrate()` refuses a file with a line starting with
  `PRAGMA`: inside its transaction `foreign_keys` is a silent no-op and
  `journal_mode = WAL` is an error. The connection pragmas (`journal_mode =
  WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, `synchronous = NORMAL`)
  are set by `setPragmas()` in `server/src/db.js`, which also refuses to go on
  if `foreign_keys` does not read back as on.
- **No `BEGIN` or `COMMIT`.** The migrator owns the transaction.
- **Data changes are tested against the old shape.** A migration that
  rewrites existing rows gets a test that builds rows in the old shape by
  running the migrations before it, then runs it. `server/test/migrate.test.js`
  shows the pattern: `migrate(db, dir)` against a temporary database and a
  temporary directory of migration files.

## Writing one

1. Create the next file:

   ```bash
   npm run db:new add_reading_dates
   ```

   This writes `server/migrations/<next version>_add_reading_dates.sql`
   containing only the license header, and prints its path.

2. Write the SQL. For a change `ALTER TABLE` cannot make, rebuild the table:

   ```sql
   CREATE TABLE books_new (...);
   INSERT INTO books_new (...) SELECT ... FROM books;
   DROP TABLE books;
   ALTER TABLE books_new RENAME TO books;
   CREATE INDEX ...;   -- indexes and triggers of the old table are gone with it
   ```

3. Apply it: restart `npm run dev`, or run `npm run db:migrate`. Check
   `schema` in `GET /api/health`.
