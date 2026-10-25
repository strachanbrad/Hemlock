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
| `/var/lib/hemlock` | `hemlock` | `DATA_DIR`: `hemlock.db` (with `hemlock.db-wal` and `hemlock.db-shm` while the server runs) and `covers/`. A deploy writes nothing here but the directories and the backups. |
| `/var/lib/hemlock/backups` | `hemlock`, mode 0700 | The deploy's backups (below). |
| `/etc/hemlock/hemlock.env` | root, mode 0600 | The service's secrets, optional (below). |
| `/etc/systemd/system/hemlock.service` | root | A copy of `deploy/hemlock.service`. |
| `/etc/nginx/sites-available/hemlock` | root | A copy of `deploy/nginx/hemlock.conf`, enabled by the link `/etc/nginx/sites-enabled/hemlock`. |

## Install

A box that still runs the old pm2 install is retired first
([below](#retiring-the-old-pm2-install)).

1. Clone the repository, on the box:

   ```bash
   sudo git clone https://github.com/strachanbrad/Hemlock.git /opt/hemlock
   ```

   The checkout belongs to root; the service only reads it.

2. Create the secrets file when Google Books or the Open Library contact is
   wanted ([Secrets](#secrets)).

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

## Redeploy

On the box:

```bash
sudo git -C /opt/hemlock pull --ff-only && sudo /opt/hemlock/deploy/deploy.sh
```

`deploy.sh` deploys exactly what is checked out and never fetches code itself.
A rerun repeats every step: one more backup, the same files, a restart.

### What deploy.sh does

1. Refuses to run as anyone but root or from anywhere but `/opt/hemlock`, then
   checks that `/usr/bin/node` is Node 26 or later, that `npm`, `sqlite3` and
   `nginx` exist, and that port 5000 is free or held by the running `hemlock`
   service.
2. Creates the `hemlock` system user when it is missing, and creates
   `/var/lib/hemlock`, `covers/` and `backups/` or resets their owner and mode.
3. Builds while the running version keeps serving: `npm ci --include=dev
   --ignore-scripts`, `npm run build`, then `chmod -R go+rX /opt/hemlock`, so a
   strict umask on the caller's side never hides files from the service or
   nginx. No dependency's install script runs as root: better-sqlite3 loads
   the prebuilt binary it ships, and its inferred `node-gyp rebuild` would
   need a compiler the box does not have. While Vite rewrites `client/dist`,
   nginx answers 404 for the client's pages.
4. Backs up the database and the covers ([Backups](#backups)).
5. Installs the unit, enables and restarts it, and polls
   `http://127.0.0.1:5000/api/health` for 30 seconds until it answers 2xx.
   Pending migrations apply when the server starts.
6. Installs the nginx site and its link, removes `sites-enabled/default` when
   it is Debian's stock link (it also claims the default server on port 80),
   runs `nginx -t`, reloads or starts nginx, and polls `/api/health` again
   through nginx on port 80.
7. Prints the health answer, `200 {"ok":true,"version":…,"schema":…}`.

### When a deploy fails

- A failed check, build or backup stops the script before the restart, and the
  running version keeps serving.
- A failed health poll prints the last 40 lines of the journal and stops before
  nginx is touched. systemd keeps restarting the new version
  (`Restart=on-failure`); fix the cause and rerun, or roll back.
- When `nginx -t` rejects the configuration, the script puts back the previous
  site file, its link and Debian's default link, and exits; the running nginx
  keeps its old configuration. The usual cause is another site that also
  claims `default_server` on port 80, such as TurnKey's `nodejs` site.

To roll back, on the box (`sudo git -C /opt/hemlock log --oneline -5` lists the
recent commits, and each deploy prints the commit it builds):

1. `sudo git -C /opt/hemlock reset --hard <commit>`
2. When the failed version applied a migration, restore the backup that its
   deploy took before the restart ([Restore](#restore)); migrations have no
   down step.
3. `sudo /opt/hemlock/deploy/deploy.sh`

## Secrets

The unit reads `/etc/hemlock/hemlock.env` when it exists
(`EnvironmentFile=-` in `deploy/hemlock.service`). systemd reads it as root
before it starts the server as `hemlock`, so the file stays root-only. Secrets
never go in an `Environment=` line or a drop-in: `systemctl show hemlock`
prints those to every local user.

The file holds one `NAME=value` line per variable, and both are optional:

- `GOOGLE_BOOKS_API_KEY`: the Google Books API key. Without it, Google Books is
  not called.
- `LOOKUP_CONTACT`: an email address sent in Open Library's `User-Agent`, which
  raises Open Library's limit from one request a second to three.

Create the file once, on the box:

```bash
sudo install -d -m 0755 /etc/hemlock
sudo install -m 0600 /dev/null /etc/hemlock/hemlock.env
```

Edit it and apply the change, on the box (`sudoedit` keeps the owner and mode):

```bash
sudoedit /etc/hemlock/hemlock.env
sudo systemctl restart hemlock
```

## Backups

Each deploy that finds a database backs it up after the build and before the
restart, into `/var/lib/hemlock/backups/`:

- `hemlock-<stamp>.db`: an online backup through SQLite's backup API
  (`sqlite3 .backup`), taken as `hemlock` while the old version serves. A plain
  copy of `hemlock.db` is not a backup: in WAL mode the latest commits are in
  `hemlock.db-wal` until a checkpoint.
- `covers-<stamp>/`: a hardlink snapshot of `covers/` (`cp -al`), which costs
  no space for the images. It stays a true snapshot because
  `server/src/covers.js` never writes into an existing cover file; it writes a
  temporary file and renames it.

`<stamp>` is the UTC time as `YYYYMMDDTHHMMSSZ`, so the names sort by age. The
deploy keeps the newest 10 pairs and deletes the rest; other names in the
directory (`manual-*`, `pre-restore-*`, `old/`) are never deleted.

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
  any `Host` header reaches it.
- **The body limit.** At least 12 MB a request. A cover upload is up to 10 MB
  plus the multipart framing, and a lower limit at the proxy answers 413
  before nginx sees the upload.
- **Access control.** Hemlock has no login: anyone who reaches it can edit or
  delete the library. Keep it LAN-only, or authenticate at the proxy.
- **The TV.** The TV's browser opens `/display` without an interactive login.
  That page loads the client (`/`, `/assets/`) and then reads `/api/display`
  and `/covers/`; with authentication at the proxy, these paths reach the TV
  without it (by the TV's LAN address, for one).

## Retiring the old pm2 install

The old install runs the server under pm2 from `/var/www/hemlock` on a TurnKey
Node.js container, and it blocks a deploy on the same box three ways: its
server holds port 5000 on every interface, so `deploy.sh` refuses to start;
its nginx site names the old host name exactly, which beats the new
catch-all until `deploy.sh` overwrites `sites-available/hemlock`; and TurnKey's own
`nodejs` site claims the default server on ports 80 and 443, so `nginx -t`
fails. Its library is not migrated (its schema is the old Authors, Books and
EBooks tables); its database and covers are kept in
`/var/lib/hemlock/backups/old/`.

TurnKey logs in as root, so the commands on the old container below run in its
root shell; `runuser -u node --` runs one as its `node` user. The old server is
in root's pm2 list or the `node` user's (`pm2 ls` and
`runuser -u node -- pm2 ls` show which); use the matching form of each `pm2`
command.

### Moving to a fresh container

1. Stop the old server and pack its files, on the old container as root:

   ```bash
   pm2 stop Hemlock
   cd /var/www/hemlock && tar -czf /root/hemlock-old.tar.gz server/hemlock.db* static/covers
   ```

   The old server's SQLite driver uses a rollback journal, so the stopped
   database is consistent as it lies.

2. Carry the archive across, on the Proxmox host as root:

   ```bash
   pct pull <old ctid> /root/hemlock-old.tar.gz /root/hemlock-old.tar.gz
   pct push <new ctid> /root/hemlock-old.tar.gz /root/hemlock-old.tar.gz
   ```

3. Unpack it, on the new box:

   ```bash
   sudo install -d -m 0700 /var/lib/hemlock/backups/old
   sudo tar -C /var/lib/hemlock/backups/old --strip-components=1 -xzf /root/hemlock-old.tar.gz
   ```

4. Point the proxy at port 80 on the new box, then shut the old container
   down, on the Proxmox host as root: `pct shutdown <old ctid>`.

### Reusing the TurnKey container

On the TurnKey container as root:

1. See what runs:

   ```bash
   pm2 ls
   runuser -u node -- pm2 ls
   systemctl list-units 'pm2*'
   ss -ltnp 'sport = :5000'
   ls -l /etc/nginx/sites-enabled/
   ```

2. Stop the old server: `pm2 stop Hemlock`.

3. Keep its files:

   ```bash
   install -d -m 0700 /var/lib/hemlock/backups/old
   cp -a /var/www/hemlock/server/hemlock.db* /var/www/hemlock/static/covers /var/lib/hemlock/backups/old/
   ```

4. Remove it from pm2: `pm2 delete Hemlock && pm2 save`. When `pm2 ls` is then
   empty, `pm2 kill` stops root's pm2 daemon.

5. Disable TurnKey's `nodejs` site: `rm /etc/nginx/sites-enabled/nodejs`. Its
   sample app (`/opt/tklweb-cp`, in the `node` user's pm2 list) can stop with
   it:

   ```bash
   runuser -u node -- pm2 delete all
   runuser -u node -- pm2 save
   pm2 unstartup systemd -u node --hp /home/node
   ```

6. Prepare the box ([The box](#the-box), steps 2 and 3, and the `nesting=1`
   check) and install Hemlock ([Install](#install)). `deploy.sh` overwrites
   `sites-available/hemlock` in place.

7. Once the new site answers, remove the rest of the old install:

   ```bash
   rm -rf /var/www/hemlock /var/log/pm2-node /var/log/nginx/hemlock_*.log
   ```

   pm2 itself (`npm -g uninstall pm2`) and `/opt/tklweb-cp` can go too.

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
