# Deployment

Hemlock runs on one Debian box behind the owner's reverse proxy. nginx serves
the built client from the checkout and the covers from the data directory, and
proxies `/api/` to the Express server, which runs as the `hemlock` user under a
systemd unit and listens on `127.0.0.1:5000` only. The files are in `deploy/`:
[`deploy.sh`](../deploy/deploy.sh) installs and redeploys,
[`hemlock.service`](../deploy/hemlock.service) is the unit, and
[`nginx/hemlock.conf`](../deploy/nginx/hemlock.conf) is the nginx site.

Every command below says where it runs: on the box, on the Proxmox host, or on
the dev machine. On the box, `sudo` runs a command as root and `sudo -u hemlock`
as the service's user; a root shell (the container's console, or
`pct enter <ctid>` on the Proxmox host) runs them unchanged once `sudo` is
installed.

## The box

A fresh, unprivileged Debian 13 container on Proxmox is the recommended box.
The unit's sandbox (`ProtectSystem`, `PrivateTmp`, `PrivateDevices` and the
other namespace options in `deploy/hemlock.service`) needs the container
feature `nesting=1`. Without it the service fails to start with
`226/NAMESPACE`, and `deploy.sh` prints the journal and stops before it touches
nginx.

1. Check the container, on the Proxmox host as root:

   ```bash
   pct config <ctid> | grep -E '^(features|unprivileged):'
   ```

   The output shows `unprivileged: 1` and a `features:` line that includes
   `nesting=1`. When it does not, set the feature and restart the container.
   `--features` replaces the whole list, so repeat any other feature the line
   already shows, comma-separated:

   ```bash
   pct set <ctid> --features nesting=1
   pct reboot <ctid>
   ```

2. Install the packages, on the box in a root shell (a fresh container has no
   `sudo` yet):

   ```bash
   apt update
   apt install -y sudo git nginx sqlite3 curl ca-certificates
   ```

3. Install Node 26 from NodeSource, on the box. Debian's own `nodejs` package
   is older.

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_26.x -o /tmp/nodesource_setup.sh
   sudo bash /tmp/nodesource_setup.sh
   sudo apt install -y nodejs
   /usr/bin/node -v
   ```

   The last command prints `v26` and the minor and patch numbers.
   `deploy.sh` checks `/usr/bin/node`, the binary the unit runs; a Node
   installed elsewhere (`/usr/local/bin`, a version manager in a home
   directory) does not count.

## Paths

| Path | Owner | Holds |
|---|---|---|
| `/opt/hemlock` | root | The git checkout; `deploy.sh` builds the client into `client/dist`, which nginx serves. The service reads the checkout and cannot write it (`ProtectSystem=strict`). |
| `/var/lib/hemlock` | `hemlock` | `DATA_DIR`: `hemlock.db` (with `hemlock.db-wal` and `hemlock.db-shm` while the server runs), `covers/`, and `secrets.key` (mode 0600) when `SECRETS_KEY` is not set ([Admin § Secrets at rest](admin.md#secrets-at-rest)). A deploy writes nothing here but the directories and the backups. |
| `/var/lib/hemlock/backups` | `hemlock`, mode 0700 | The deploy's backups (below). |
| `/etc/hemlock/hemlock.env` | root, mode 0600 | The service's secrets, optional (below). |
| `/etc/systemd/system/hemlock.service` | root | A copy of `deploy/hemlock.service`. |
| `/etc/nginx/sites-available/hemlock` | root | A copy of `deploy/nginx/hemlock.conf`, enabled by the link `/etc/nginx/sites-enabled/hemlock`. |

## Install

1. Clone the repository, on the box:

   ```bash
   sudo git clone https://github.com/strachanbrad/Hemlock.git /opt/hemlock
   ```

   The checkout belongs to root; the service only reads it.

2. Create the secrets file with a `SECRETS_KEY` ([Secrets](#secrets)).

3. Preview the deploy, on the box:

   ```bash
   sudo DRY_RUN=1 /opt/hemlock/deploy/deploy.sh
   ```

   It prints every command it would run and runs none of them; a failed check
   prints as a warning and the preview carries on.

4. Deploy, on the box:

   ```bash
   sudo /opt/hemlock/deploy/deploy.sh
   ```

5. Set the admin password ([The admin password](#the-admin-password)), then
   enter the Google Books and Anthropic keys on `/admin`
   ([Admin](admin.md)).

## Redeploy

On the box:

```bash
sudo git -C /opt/hemlock pull --ff-only && sudo /opt/hemlock/deploy/deploy.sh
```

`deploy.sh` deploys exactly what is checked out and never fetches code itself.
A rerun repeats every step: one more backup, the same files, a restart.

A tab opened before a redeploy still runs the old build, whose lazy chunks
(the barcode scanner, the display page) the new build no longer has: Vite
empties `client/dist`, and nginx answers 404 for a missing asset. When such a
tab asks for one, it reloads itself once. `reloadOnStaleChunk()`
(`client/src/lib/staleChunks.js`, called from `client/src/main.jsx`) listens
for Vite's `vite:preloadError` and, when the tab has not reloaded for this
reason in the last minute, reloads it, which loads the new build and loses
any unsaved input on the page. The reload is remembered in session storage;
a second failure within the minute, or one in a tab without session storage,
surfaces as an error.

### What deploy.sh does

1. Refuses to run as anyone but root or from anywhere but `/opt/hemlock`, then
   checks that `/usr/bin/node` is Node 26 or later, that `npm`, `sqlite3` and
   `nginx` exist, and that port 5000 is free or held by the running `hemlock`
   service.
2. Creates the `hemlock` system user when it is missing, and creates
   `/var/lib/hemlock`, `covers/` and `backups/` or resets their owner and mode.
3. Builds while the running version keeps serving. First it keeps the tree
   the running version uses: each of `node_modules`, `client/node_modules`,
   `server/node_modules` and `client/dist` that exists is copied as hardlinks
   (`cp -al`) to `<path>.deploy-prev`, after any copy an interrupted run left
   is removed. Then `npm ci --include=dev --ignore-scripts` and `npm run
   build`; when both succeed the copies are removed, and `chmod -R go+rX
   /opt/hemlock` runs, so a strict umask on the caller's side never hides
   files from the service or nginx. The hardlink copies stay whole because
   `npm ci` (which empties every `node_modules` before it fetches anything)
   and Vite (which empties `client/dist`) remove files and write new ones,
   never into an existing file. No dependency's install script runs as root:
   better-sqlite3 loads the prebuilt binary it ships, and its inferred
   `node-gyp rebuild` would need a compiler the box does not have. While Vite
   rewrites `client/dist`, nginx answers 404 for the client's pages.
4. Backs up the database, the covers and `secrets.key` ([Backups](#backups)).
5. Installs the unit, enables and restarts it, and polls
   `http://127.0.0.1:5000/api/health` for 30 seconds until it answers 2xx.
   Pending migrations apply when the server starts.
6. Installs the nginx site and its link, removes `sites-enabled/default` when
   it is Debian's stock link (it also claims the default server on port 80),
   runs `nginx -t`, reloads or starts nginx, and polls `/api/health` again
   through nginx on port 80.
7. Prints the health answer, `200 {"ok":true,"version":…,"schema":…}`, then
   deletes all but the newest 10 backup sets ([Backups](#backups)).

### When a deploy fails

- A failed check or backup stops the script before the restart, and the
  running version keeps serving.
- A failed `npm ci` or build puts the kept `node_modules` and `client/dist`
  back, prints `the install or build failed; the previous node_modules and
  client/dist are back in place`, and stops before the backup and the
  restart. The running version keeps serving with the dependencies it
  started with. The checkout is already at the new commit, though, so a
  restart before the next good deploy (a reboot, a crash) runs the new code
  against the old dependencies: fix the cause and rerun, or roll back.
- A failed restart or health poll prints the last 40 lines of the journal and
  stops before nginx is touched, with `hemlock did not start; nginx is
  unchanged` (the restart itself failed, as with `226/NAMESPACE`) or
  `hemlock is not answering on 127.0.0.1:5000; nginx is unchanged`. systemd
  keeps restarting the new version (`Restart=on-failure`); fix the cause and
  rerun, or roll back.
- A failed deploy deletes no backup ([Backups](#backups)).
- When `nginx -t` rejects the configuration, the script puts back the previous
  site file, its link and Debian's default link, and exits; the running nginx
  keeps its old configuration. The usual cause is another site that also
  claims `default_server` on port 80.

To roll back, on the box (`sudo git -C /opt/hemlock log --oneline -5` lists the
recent commits, and each deploy prints the commit it builds):

1. `sudo git -C /opt/hemlock reset --hard <commit>`
2. When the failed version applied a migration, restore the backup that its
   deploy took before the restart ([Restore](#restore)); migrations have no
   down step. Without the restore, the older server refuses to start on the
   newer schema ([Migrations](migrations.md#what-migrate-does)), and the
   deploy stops at its health poll.
3. `sudo /opt/hemlock/deploy/deploy.sh`

## Secrets

The unit reads `/etc/hemlock/hemlock.env` when it exists
(`EnvironmentFile=-` in `deploy/hemlock.service`). systemd reads it as root
before it starts the server as `hemlock`, so the file stays root-only. Secrets
never go in an `Environment=` line or a drop-in: `systemctl show hemlock`
prints those to every local user.

The file holds one `NAME=value` line per variable, and all are optional:

- `SECRETS_KEY`: 64 hexadecimal characters, the key that encrypts the
  secrets saved on the admin page ([Admin § Secrets at rest](admin.md#secrets-at-rest)).
  Recommended: without it the key is `/var/lib/hemlock/secrets.key`, beside
  the database it protects, and every backup must carry it. Changing it
  makes every saved secret, the admin password included, count as not set
  until it is entered again.
- `GOOGLE_BOOKS_API_KEY`: the Google Books API key. Without it, and without
  one saved on the admin page, Google Books is not called.
- `ANTHROPIC_API_KEY`: the Anthropic API key for the Claude lookup
  ([Lookup § Claude](lookup.md#claude)). Without it, and without one saved
  on the admin page, Claude is not asked.
- `LOOKUP_CONTACT`: an email address sent in Open Library's `User-Agent`, which
  raises Open Library's limit from one request a second to three.

A key or contact saved on the admin page wins over this file; the file is
the fallback. Entering keys on the page keeps them out of this file
altogether.

Create the file once, with a new `SECRETS_KEY`, on the box (the key goes
from `openssl` straight into the file, never onto a command line):

```bash
sudo install -d -m 0755 /etc/hemlock
sudo install -m 0600 /dev/null /etc/hemlock/hemlock.env
{ printf 'SECRETS_KEY='; openssl rand -hex 32; } | sudo tee -a /etc/hemlock/hemlock.env > /dev/null
```

Edit it and apply the change, on the box (`sudoedit` keeps the owner and mode):

```bash
sudoedit /etc/hemlock/hemlock.env
sudo systemctl restart hemlock
```

### The admin password

`/admin` asks for a password that is set only from the command line
([Admin § The password](admin.md#the-password)). The script must run as
`hemlock` and with the service's `SECRETS_KEY`, so on the box it reads
`/etc/hemlock/hemlock.env` as root and then runs as `hemlock`; the key passes
through the environment, never the command line:

```bash
sudo sh -c 'set -a; [ -f /etc/hemlock/hemlock.env ] && . /etc/hemlock/hemlock.env; cd /opt/hemlock && exec runuser -u hemlock -- env NODE_ENV=production DATA_DIR=/var/lib/hemlock node server/scripts/admin-password.js'
```

It prompts twice for the password, without echoing it, and signs every
browser out. Running it again changes the password.

## Backups

Each deploy that finds a database backs it up after the build and before the
restart, into `/var/lib/hemlock/backups/`:

- `hemlock-<stamp>.db`: an online backup through SQLite's backup API
  (`sqlite3 .backup`), taken as `hemlock` while the old version serves. A plain
  copy of `hemlock.db` is not a backup: in WAL mode the latest commits are in
  `hemlock.db-wal` until a checkpoint.
- `covers-<stamp>/`: a hardlink snapshot of `covers/` (`cp -al`), which costs
  no space for the images. It stays a true snapshot because neither cover
  writer writes into an existing file: `writeCover()` in
  `server/src/coverFiles.js` creates an upload with the `wx` flag, and
  `saveCoverFromUrl()` in `server/src/covers.js` writes a temporary file and
  renames it.

- `secrets-<stamp>.key`: a copy of `secrets.key`, when the box has one (no
  `SECRETS_KEY`). The settings' secrets in the database decrypt only with
  it.

`<stamp>` is the UTC time as `YYYYMMDDTHHMMSSZ`, so the names sort by age.
Once the new version answers its health checks, the deploy keeps the newest
10 sets and deletes the rest. A deploy that fails deletes none, so each rerun
of a failing deploy adds a backup and never pushes out the one taken before
the failing version first started. Other names in the directory
(`manual-*`, `pre-restore-*`) are never deleted.

A backup at any other time, on the box:

```bash
sudo -u hemlock sqlite3 /var/lib/hemlock/hemlock.db ".backup '/var/lib/hemlock/backups/manual-$(date -u +%Y%m%dT%H%M%SZ).db'"
```

It runs as `hemlock`, never as root: a backup that dies leaves `-wal` and
`-shm` files owned by its user, and the service cannot open a database whose
side files root owns.

The backups live on the box, so they do not survive the loss of the box; a
backup of the whole container on the Proxmox host does.

## Restore

`<stamp>` names the backup to restore (`sudo ls /var/lib/hemlock/backups`
lists them). On the box, in one shell session:

1. Stop the service:

   ```bash
   sudo systemctl stop hemlock
   ```

2. Keep the current state:

   ```bash
   now=$(date -u +%Y%m%dT%H%M%SZ)
   sudo -u hemlock sqlite3 /var/lib/hemlock/hemlock.db ".backup '/var/lib/hemlock/backups/pre-restore-$now.db'"
   ```

3. Remove the side files. This step is required: SQLite replays a leftover WAL
   over the restored file, which silently undoes the restore or corrupts it.

   ```bash
   sudo rm -f /var/lib/hemlock/hemlock.db-wal /var/lib/hemlock/hemlock.db-shm
   ```

4. Put the backup in place:

   ```bash
   sudo install -o hemlock -g hemlock -m 0644 /var/lib/hemlock/backups/hemlock-<stamp>.db /var/lib/hemlock/hemlock.db
   ```

5. Put the covers in place:

   ```bash
   sudo mv /var/lib/hemlock/covers /var/lib/hemlock/backups/covers-pre-restore-$now
   sudo -u hemlock cp -al /var/lib/hemlock/backups/covers-<stamp> /var/lib/hemlock/covers
   ```

   On a box without `SECRETS_KEY` whose `secrets.key` is gone, put the
   copy taken with the backup back too:

   ```bash
   sudo install -o hemlock -g hemlock -m 0600 /var/lib/hemlock/backups/secrets-<stamp>.key /var/lib/hemlock/secrets.key
   ```

6. Start the service; pending migrations apply when it starts:

   ```bash
   sudo systemctl start hemlock
   ```

7. Check it: `curl -s http://127.0.0.1:5000/api/health` answers
   `{"ok":true,…}`.

The `pre-restore-` files stay until they are removed by hand.

## Logs

On the box:

- The server: `sudo journalctl -u hemlock` (`-f` follows, `-n 100` shows the
  last hundred lines, `-b` starts at the last boot); `systemctl status hemlock`
  shows the state and the latest lines.
- nginx: `/var/log/nginx/access.log` and `/var/log/nginx/error.log`, Debian's
  defaults; the site sets no log files of its own.
- A deploy prints its steps to the terminal and keeps no log.

nginx logs the proxy's address as the client. To log the browser's address
instead, when the proxy sends `X-Forwarded-For`, write
`/etc/nginx/conf.d/hemlock-realip.conf` on the box as root with these two
lines, then run `sudo nginx -t && sudo systemctl reload nginx`:

```nginx
set_real_ip_from <the proxy's address>;
real_ip_header X-Forwarded-For;
```

## The reverse proxy

The owner's reverse proxy sits in front of nginx and needs:

- **TLS.** The proxy terminates HTTPS. It is a requirement, not an option: a
  phone browser grants camera access for barcode scanning only on a secure
  origin. Plain HTTP from the proxy to the box is fine; nothing on the box
  listens on 443, and nginx's redirects are relative (`absolute_redirect off`),
  so they keep the browser's `https`.
- **The upstream.** Port 80 on the box. The site is nginx's default server, so
  any `Host` header reaches it ([narrowing it](#answering-only-hemlocks-names-optional)).
- **The body limit.** At least 12 MB a request. A cover upload is up to 10 MB
  plus the multipart framing, and a lower limit at the proxy answers 413
  before nginx sees the upload.
- **The read timeout.** At least 5 minutes for
  `POST /api/lookup/<isbn>/identify`. A Claude lookup makes up to four
  requests of up to a minute each before it answers; the nginx site gives
  that path a 300-second `proxy_read_timeout`, and a shorter timeout at the
  proxy answers 504 while Claude is still searching.
- **Access control.** Hemlock has no login: anyone who reaches it can edit or
  delete the library. Keep it LAN-only, or authenticate at the proxy.
- **The TV.** The TV's browser opens `/display` without an interactive login.
  That page loads the client (`/`, `/assets/`) and then reads `/api/display`
  and `/covers/`; with authentication at the proxy, these paths reach the TV
  without it (by the TV's LAN address, for one).

### Answering only Hemlock's names (optional)

The shipped site answers any `Host`. A page on another domain that a
household browser opens can point its own name at the box's LAN address (DNS
rebinding) and then call `/api/` as Hemlock's own pages do, reading or
deleting the library. Many home routers refuse such DNS answers, and Chromium
asks before a public page reaches a private address; Firefox does neither.
Naming the hosts nginx serves Hemlock for, and closing every other
connection, stops it. This is defence in depth, not access control: the
reverse proxy, and port 80 on the box being reachable from the LAN only,
remain the boundary.

`server_name` keeps:

- the `Host` the proxy sends: most proxies pass the browser's own through,
  so it is the public name (`hemlock.example.com`); a proxy that rewrites
  it sends the box's address;
- the LAN address the TV opens `/display` by (`192.168.1.20`, say);
- `127.0.0.1` and `localhost`: `deploy.sh` polls `http://127.0.0.1/api/health`
  through nginx, and without them every deploy stops with `nginx on port 80
  does not reach hemlock`, after the new server has started.

`deploy.sh` installs `deploy/nginx/hemlock.conf` from the checkout over
`/etc/nginx/sites-available/hemlock` on every deploy, so an edit to the
installed file lasts only until the next deploy. The names go into the
checkout's copy, and the catch-all into a file of its own that no deploy
touches. On the box:

1. Edit the checkout's site (`sudoedit /opt/hemlock/deploy/nginx/hemlock.conf`)
   so that its first three lines inside `server {` read, with the real names:

   ```nginx
       listen 80;
       listen [::]:80;
       server_name hemlock.example.com 192.168.1.20 127.0.0.1 localhost;
   ```

2. Write the catch-all (`sudoedit /etc/nginx/conf.d/hemlock-default.conf`);
   `444` closes the connection without an answer:

   ```nginx
   server {
       listen 80 default_server;
       listen [::]:80 default_server;
       server_name _;
       return 444;
   }
   ```

3. Install the site and reload nginx:

   ```bash
   sudo install -m 0644 /opt/hemlock/deploy/nginx/hemlock.conf /etc/nginx/sites-available/hemlock
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. Check it:

   ```bash
   curl -s http://127.0.0.1/api/health
   curl -s -H 'Host: elsewhere.example' http://127.0.0.1/api/health; echo "curl exit $?"
   ```

   The first answers `{"ok":true,…}`; the second prints only `curl exit 52`
   (an empty reply).

The edit is a local change to a tracked file in the checkout:

- `git pull --ff-only` keeps it unless the update also changes
  `deploy/nginx/hemlock.conf`; the pull then stops with `Your local changes
  to the following files would be overwritten by merge`. Run
  `sudo git -C /opt/hemlock stash`, the pull, and
  `sudo git -C /opt/hemlock stash pop`, then deploy.
- `git reset --hard`, the first step of a rollback, discards it.
- A lost edit does not reopen the box silently: the site then claims
  `default_server` beside `hemlock-default.conf`, `nginx -t` fails on the
  duplicate default server, and `deploy.sh` puts the previous site back and
  stops ([When a deploy fails](#when-a-deploy-fails)). Make the edit again
  and rerun `deploy.sh`.

## Checking the deploy files on the dev machine

These run on the dev machine as the owner's own user, from the checkout, and
never as root:

- `bash -n deploy/deploy.sh`, `systemd-analyze verify deploy/hemlock.service`
  and `systemd-analyze security --offline=yes deploy/hemlock.service`.
- `DRY_RUN=1 deploy/deploy.sh` prints the box's plan. The checks that cannot
  pass off the box (the checkout path, root, nginx) print as warnings.
- `PREFIX=<dir>` runs the whole script against a fake root under `<dir>` as
  the invoking user. It skips `useradd`, `chown`, `runuser`, `systemctl`
  (apart from an offline `systemctl --root=<dir> enable`) and nginx. In place
  of the restart it starts the built `server/src/index.js` with the unit's
  environment, `DATA_DIR` under `<dir>` and `PORT` from the caller (5000 by
  default), polls `/api/health`, and stops the server when the script exits.
  The script runs from its own clone at `<dir>/opt/hemlock`:

  ```bash
  git clone . <dir>/opt/hemlock
  PREFIX=<dir> PORT=<a free port> <dir>/opt/hemlock/deploy/deploy.sh
  ```
