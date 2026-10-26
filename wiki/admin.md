# Admin page

`/admin` is where the owner enters the keys and addresses the lookups use
(the Google Books API key, the Anthropic API key and Claude model for the
Claude lookup, [Lookup § Claude](lookup.md#claude), and the Open Library
contact address), manages the people who sign in to Hemlock, and pairs
televisions. Nothing links to it: it is not in the sider or the phone's tab
bar, and it is reached by typing its address. It is a page of the shell, so
it needs a user's session like every page
([Security § Sessions](security.md#sessions)), and then its own password.
The admin password is not a user, and no user is an admin.

Code: `client/src/pages/Admin/` (the page, `UsersCard.jsx`,
`TelevisionsCard.jsx`, `useAdminList.js` and `admin.css`),
`client/src/api/admin.js`, `server/src/routes/admin.js`,
`server/src/auth.js` (password hashing, sessions, the login lockout, the
cookies), `server/src/settings.js` (the settings store and its encryption),
`server/src/users.js`, `server/src/devices.js`,
`server/scripts/admin-password.js`, `server/scripts/user-add.js`,
`server/migrations/002_settings.sql` and `server/migrations/003_users.sql`.

## The page

The page first asks the server whether this browser is signed in
(`GET /api/admin/session`), showing a spinner meanwhile. Signed out, it
shows one password field and Sign in; a wrong password, the lockout and
"no password is set" show beneath the field as the server words them.

Signed in, it shows five cards and Sign out of admin, which ends only the
admin session (the shell's Sign out ends the user's):

- **Google Books**: the key's status ("Set, ends in …abcd", "From the
  environment" or "Not set"), a key field, Save, Clear (only for a key
  saved here) and Test.
- **Claude**: the same for the Anthropic API key, then the model:
  `claude-opus-5-5` (the default), `claude-sonnet-5-5`, `claude-haiku-5-5`,
  or "Another model…" with a field for any model id. Save sends the key
  when one is typed and the model when it changed; choosing the default
  clears a saved model.
- **Open Library contact**: the email address and its status, Save and
  Clear.
- **Users** ([Users](#users)) and **Televisions**
  ([Televisions](#televisions)).

A key field is write-only. The server never sends a key back, only its last
four characters, so the field starts empty with the placeholder "Leave blank
to keep" and empties again after a save. Saving with the field empty keeps
the saved key. When the session ends while the page is open (it expired, or
the password changed), the next action returns to the sign-in form.

## The password

The password is set only on the command line, never from the page: a
first-visit form would let anyone on the network claim the page first.
`npm run admin:password` reads it from standard input, a hidden prompt (asked
twice) on a terminal or the first line of a pipe, never from an argument,
which every local user can read in `ps`. It needs at least 8 characters. The
script stores a scrypt hash (`N` 2^15, `r` 8, `p` 1, a random 16-byte salt,
stored with its parameters as `scrypt$N$r$p$salt$hash`) as the secret
setting `admin_password_hash`, and deletes every session, so setting the
password again signs every browser out.

On the dev machine, from the root of the checkout:

```bash
npm run admin:password
```

On the box the script needs the service's own environment: it runs as
`hemlock`, so the database's side files and `secrets.key` stay the
service's, and with the `SECRETS_KEY` of `/etc/hemlock/hemlock.env` when that
file sets one, or the service could not decrypt the hash. Run it as written
in [Deployment § The admin password](deployment.md#the-admin-password).

`npm run db:reset` drops the settings with the rest of the dev library, the
password included.

## Admin sessions

- `POST /api/admin/login { password }` checks the password with scrypt and
  `timingSafeEqual`. It answers 204 with the session cookie, 401
  `{ error: 'Wrong password' }`, 400 without a password, 503 when no
  password is set (the message names the command), and 429 with
  `Retry-After` once 5 wrong passwords fall within 15 minutes. The count is
  in memory for the whole process, not per address (one household, one
  password). A right password clears it; a restart empties it.
- The cookie is `hemlock_admin`: 32 random bytes in base64url, `HttpOnly`,
  `SameSite=Strict`, `Path=/api/admin` (no other request carries it),
  `Max-Age` 30 days from the login, and `Secure` when
  `NODE_ENV=production` ([Security § Admin sessions](security.md#admin-sessions)).
- The `sessions` table keeps only the token's SHA-256 and the expiry fixed
  at login. A login deletes the expired rows first.
- `GET /api/admin/session` answers 200 `{ admin: true }` or 401.
  `POST /api/admin/logout` answers 204, deletes the row and clears the
  cookie, signed in or not.
- Every other `/api/admin/*` path, an unknown one included, answers 401
  `{ error: 'Not signed in' }` before it reads or changes a setting.

## Users

There is one kind of user: everyone signed in sees and edits the whole
library. How a user signs in, and what their session is, is in
[Security § Sessions](security.md#sessions); the login page is in
[Library § Signing in](library.md#signing-in).

A name is trimmed, 1 to 64 characters, without control characters, and
unique without regard to ASCII case (`Ana` and `ana` are one name; the
login finds it either way). A password has at least 8 characters. The
`users` table keeps a scrypt hash, as for the admin password
([The password](#the-password)), never the password.

The first user is added on the command line, since nobody can sign in to
reach this page before one exists. `npm run user:add <name>` takes the
name as its argument (it is not a secret) and reads the password as
`admin:password` does: a hidden prompt, asked twice, on a terminal, or the
first line of a pipe, never an argument. It refuses a name already taken.
On the dev machine, from the root of the checkout:

```bash
npm run user:add Ana
```

On the box it runs as written in
[Deployment § The first user](deployment.md#the-first-user). The dev
library has a user already: `npm run db:reset` adds `dev` with the password
`hemlock-dev` ([Development setup](dev-setup.md#the-dev-data-directory)).

After that, users are managed on the **Users** card: the list with each
name and its last sign-in ("Last signed in 2026-10-25 21:46" or "Never
signed in"), **Set password** (a field under the row, Save password),
**Remove** behind a `Popconfirm`, and the Name and Password fields with
**Add user**. A name already taken shows under the name field as the server
words it. Setting a user's password or removing them ends every session
they hold, so each of their browsers lands on the login page at its next
request; setting your own password signs you out too.

| Request (behind the admin cookie) | Answer |
|---|---|
| `GET /api/admin/users` | 200, `[{ id, name, created_at, last_login_at }]` by name |
| `POST /api/admin/users { name, password }` | 201, the user; 400 naming the field; 409 `The name <name> is taken` |
| `PUT /api/admin/users/:id/password { password }` | 204; 400 naming the field; 404 |
| `DELETE /api/admin/users/:id` | 204; 404 |

`created_at` and `last_login_at` are UTC instants (`toISOString()`); the
card shows them in the browser's time zone (`localDateTime()` in
`client/src/lib/dates.js`).

## Televisions

A television (the [Roku channel](roku.md)) reads the library with a
token of its own instead of a user's session. It gets one by pairing: it
shows a six-digit code, and the owner types the code here. The token is
never typed on a remote, each TV has its own, and removing a TV here ends
it. The token is a credential like a session
([Security § Sessions](security.md#sessions)).

The **Televisions** card says "To pair a TV, open Hemlock on it and type
the code it shows", then a Code field (six digits; spaces are ignored, so
"048 213" works), a Name field ("Living room") and **Pair**, then the
paired TVs, each with when it was paired and when it was last seen, and
**Remove** behind a `Popconfirm`. A code no TV is showing shows under the
code field.

The pairing, from the TV's side (`server/src/routes/devices.js`, open to
anyone; a code is worth nothing until it is typed on this page):

1. `POST /api/devices/pair` answers `{ code, poll }`: `code` is six digits
   as a string (`"048213"`, which the TV shows as two groups of three) and
   `poll` a random handle. Both are unique among the pairings waiting. A
   pairing waits in the server's memory for 10 minutes; a restart forgets
   it, and the TV asks again. At most 20 wait at once (503 beyond) and at
   most 3 start per minute from one visitor address (429); both answers
   carry `Retry-After` in seconds. The address is the one `TRUSTED_PROXIES`
   lets the server read from `X-Forwarded-For`
   ([Deployment § Secrets](deployment.md#secrets)); without it, everyone
   behind the proxy counts as one address.
2. The TV asks `GET /api/devices/pair/<poll>` every few seconds: 204 while
   the pairing waits, 200 `{ token }` once it is approved, and 410 when it
   expired, was already collected or never existed. The token is handed
   over once; the pairing is then gone. Both answers are `Cache-Control:
   no-store`.
3. Pair on this page sends `POST /api/admin/devices { code, name }`
   (behind the admin cookie). It approves the waiting pairing with that
   code and stores the TV with the name (1 to 64 characters) and the
   token's SHA-256 (`devices.token_hash`), never the token. It answers 201
   `{ id, name, created_at }`; 404 `No television is showing that code` for
   a wrong, expired or already approved code; 400 naming the field.

From then on the TV sends `Authorization: Bearer <token>` with every
request; the guard accepts it on every `/api` route
([Security § Sessions](security.md#sessions)) and stamps the TV's
`last_seen_at` at most once an hour. `GET /api/session` answers a TV 401:
it is not a user.

| Request (behind the admin cookie) | Answer |
|---|---|
| `GET /api/admin/devices` | 200, `[{ id, name, created_at, last_seen_at }]` in the order paired |
| `POST /api/admin/devices { code, name }` | 201, `{ id, name, created_at }`; 404; 400 |
| `DELETE /api/admin/devices/:id` | 204, and that TV's next request answers 401; 404 |

## Settings

| Setting | Secret | Environment fallback | Default |
|---|---|---|---|
| `google_books_api_key` | yes | `GOOGLE_BOOKS_API_KEY` | none: Google Books is not asked |
| `anthropic_api_key` | yes | `ANTHROPIC_API_KEY` | none: Claude is not asked |
| `anthropic_model` | no | none | `claude-opus-5-5` |
| `lookup_contact` | no | `LOOKUP_CONTACT` | none |
| `admin_password_hash` | yes | none | none: the login answers 503 |

A value saved on the page wins; without one, the environment's value
applies, so the box's `/etc/hemlock/hemlock.env`
([Deployment § Secrets](deployment.md#secrets)) keeps working. Clearing a
setting returns it to the environment's value or the default. The lookup,
the Claude lookup and the cover downloads read their key, model and contact
on every request (`settings.get()`), so a change applies without a restart.

- `GET /api/admin/settings` answers each of the first four as
  `{ is_set, source: 'settings' | 'env' | null, hint }`: `hint` is the last
  four characters of a secret, the whole value of a plain setting, and null
  when nothing is set. A secret never leaves the server.
- `PUT /api/admin/settings` takes any of the four: a non-empty string sets
  it, `null` clears it, and an absent key or an empty string leaves it
  alone. A value is trimmed and must have no inner whitespace and at most
  256 characters; `anthropic_model` matches `^[a-z0-9.-]+$`;
  `lookup_contact` is an email address (the rule `LOOKUP_CONTACT` follows).
  A bad value answers 400 naming the field and changes nothing; an unknown
  key, `admin_password_hash` included, answers 400. It answers the GET's
  shape.

## Secrets at rest

A secret is stored AES-256-GCM encrypted as
`v1:<iv>:<tag>:<ciphertext>` (base64url, a random 12-byte IV, the setting's
name as additional data, so a value copied into another row does not
decrypt). The key is `SECRETS_KEY` from the environment, 64 hexadecimal
characters, when it is set; otherwise `DATA_DIR/secrets.key`, 32 random
bytes written with mode 0600 by the first secret saved. The server refuses
to start when `SECRETS_KEY` is set but malformed.

A value that does not decrypt, because `SECRETS_KEY` changed or
`secrets.key` was lost, counts as not set: the environment's value or the
default applies, one line is logged per value
(`Setting <name> cannot be decrypted …`), and nothing crashes. Enter the key
again on the page, and set the password again with the command. Back up
`secrets.key` with the database when `SECRETS_KEY` is not set
([Deployment § Backups](deployment.md#backups)).

## Test buttons

`POST /api/admin/settings/test { service: 'google' | 'anthropic' }` tests
what is saved, not what is typed in the form:

- `google`: one `volumes?q=isbn:9780553212587` request with the key
  (`probeGoogle()` in `server/src/lookup/google.js`); the result names the
  volume count.
- `anthropic`: one message, "Reply with the single word ok.", with
  `max_tokens` 64 and `output_config: { effort: 'low' }` on the saved model
  (`probe()` in `server/src/lookup/anthropic.js`); the result names the
  model and its reply. Thinking cannot be turned off on `claude-opus-5-5`,
  so the reply can be empty when thinking uses the 64 tokens; the
  connection still counts as working.

The answer is 200 `{ ok: true, latency_ms, detail }`, 502 `{ error }` with
the provider's own message and the key replaced by `[redacted]` wherever it
appears, or 503 when that key is not set. The page shows it under the card's
buttons.

## Tests

`server/test/settings.test.js` (round trip, ciphertext only, a rotated key,
the environment fallback, `secrets.key`, `SECRETS_KEY`),
`server/test/admin.test.js` (the cookie's attributes, the lockout, sign-out,
401 on every route without a session, the PUT rules, the test button's
redaction, no key in any response, the password script reading a pipe) and
`client/test/Admin.test.jsx` (the three states, saving, testing, an ended
session, and the Users and Televisions cards). The users, their sessions
and the login are tested in `server/test/users.test.js` (with the
`user:add` script), the pairing and the TV token in
`server/test/devices.test.js`.
