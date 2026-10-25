#!/usr/bin/env bash
# Copyright (c) 2023 Hemlock
# SPDX-License-Identifier: GPL-3.0-only

set -euo pipefail
umask 022
export PATH=/usr/sbin:/usr/bin:/sbin:/bin

PREFIX=${PREFIX:-}
DRY_RUN=${DRY_RUN:-0}
NODE=/usr/bin/node
NODE_MAJOR=26
KEEP=10
APP=$PREFIX/opt/hemlock
DATA=$PREFIX/var/lib/hemlock
UNIT=$PREFIX/etc/systemd/system/hemlock.service
NGINX=$PREFIX/etc/nginx
# Environment=PORT in hemlock.service and proxy_pass in nginx/hemlock.conf use the same port.
if [[ -n $PREFIX ]]; then PORT=${PORT:-5000}; else PORT=5000; fi

say()  { printf '==> %s\n' "$*"; }
die()  { printf 'deploy: %s\n' "$*" >&2; exit 1; }
# A dry run reports a failed check and carries on, so it also runs off the box.
fail() { if [[ $DRY_RUN == 1 ]]; then printf 'deploy: (dry run) %s\n' "$*" >&2; else die "$*"; fi; }
run()  { printf '+ %s\n' "$*"; [[ $DRY_RUN == 1 ]] || "$@"; }
as_hemlock() { if (( SYSTEM )); then run runuser -u hemlock -- "$@"; else run "$@"; fi; }

# SYSTEM=0 skips useradd, chown, runuser, systemctl and nginx; only a PREFIX run has it.
system=1
[[ -z $PREFIX ]] || system=0
[[ ${SYSTEM:-$system} == "$system" ]] || die "SYSTEM is 0 with PREFIX and 1 without it"
SYSTEM=$system

health() {
  "$NODE" -e '
    fetch(process.argv[1], { signal: AbortSignal.timeout(2000) }).then(
      async (r) => {
        (r.ok ? console.log : console.error)(r.status, await r.text())
        process.exit(r.ok ? 0 : 1)
      },
      (e) => { console.error(e.cause?.code ?? e.message); process.exit(1) })' "$1"
}
# A restart returns before the server listens, so the first answers can be refusals.
wait_healthy() {
  local _
  for _ in $(seq 29); do health "$1" 2>/dev/null && return 0; sleep 1; done
  health "$1"
}

server=""
saved=""
# What npm ci and the build replace under the checkout; each waits as <path>.deploy-prev until both succeed.
built=(node_modules client/node_modules server/node_modules client/dist)
restore=0
put_back() {
  local dir
  for dir in "${built[@]}"; do
    rm -rf -- "${repo:?}/$dir"
    if [[ -e $repo/$dir.deploy-prev ]]; then mv -- "$repo/$dir.deploy-prev" "$repo/$dir"; fi
  done
}
cleanup() {
  if (( restore )); then
    put_back || true
    printf 'deploy: %s\n' "the install or build failed; the previous node_modules and client/dist are back in place" >&2
  fi
  if [[ -n $server ]]; then kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; fi
  if [[ -n $saved ]]; then rm -f -- "$saved" || true; fi
}
trap cleanup EXIT

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
[[ $DRY_RUN != 1 ]] || say "Dry run: commands are printed, not run"
[[ $repo == "$APP" ]] || fail "the checkout must be $APP; this one is $repo"
[[ -n $PREFIX ]] || (( EUID == 0 )) || fail "run as root: sudo $APP/deploy/deploy.sh"

say "Prerequisites"
if [[ -x $NODE ]]; then
  major=$("$NODE" -p 'process.versions.node.split(".")[0]')
  (( major >= NODE_MAJOR )) || fail "$NODE is $("$NODE" -v); Hemlock needs Node $NODE_MAJOR or later (wiki/deployment.md)"
else
  fail "$NODE not found: install Node $NODE_MAJOR from NodeSource (wiki/deployment.md)"
fi
for cmd in npm sqlite3; do command -v "$cmd" >/dev/null || fail "$cmd not found"; done
(( SYSTEM == 0 )) || command -v nginx >/dev/null || fail "nginx not found"
if ss -Hltn "sport = :$PORT" | grep -q . && ! { (( SYSTEM )) && systemctl -q is-active hemlock; }; then
  fail "port $PORT is held by another process"
fi

say "User and directories"
if (( SYSTEM )) && ! id -u hemlock >/dev/null 2>&1; then
  run useradd --system --user-group --home-dir /var/lib/hemlock --no-create-home \
    --shell /usr/sbin/nologin hemlock
fi
own=()
(( SYSTEM == 0 )) || own=(-o hemlock -g hemlock)
run install -d -m 0755 "${own[@]}" "$DATA" "$DATA/covers"
run install -d -m 0700 "${own[@]}" "$DATA/backups"

say "Build $(git -C "$repo" log -1 --format='%h %s' 2>/dev/null || echo '(not a git checkout)')"
cd -- "$repo"
# npm ci empties every node_modules before it fetches, and Vite empties client/dist. Both unlink
# files and write new ones, never into an existing inode, so a hardlink copy keeps the old tree whole.
run rm -rf -- "${built[@]/%/.deploy-prev}"
for dir in "${built[@]}"; do
  [[ ! -d $dir ]] || run cp -al -- "$dir" "$dir.deploy-prev"
done
[[ $DRY_RUN == 1 ]] || restore=1
# NODE_ENV=production in the caller's environment would make npm ci skip Vite. No dependency
# needs an install script; better-sqlite3's inferred node-gyp rebuild would compile as root.
run npm ci --include=dev --ignore-scripts --no-audit --no-fund
run npm run build
restore=0
run rm -rf -- "${built[@]/%/.deploy-prev}"
run chmod -R go+rX "$repo"

say "Backup"
if [[ -f $DATA/hemlock.db ]]; then
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  # As hemlock: a backup that dies leaves -wal and -shm behind, and root-owned ones lock the service out.
  as_hemlock sqlite3 "$DATA/hemlock.db" ".backup '$DATA/backups/hemlock-$stamp.db'"
  as_hemlock cp -al "$DATA/covers" "$DATA/backups/covers-$stamp"
else
  echo "no database yet"
fi

say "Service"
run install -D -m 0644 deploy/hemlock.service "$UNIT"
log=""
not_serving() {
  if [[ -z $log ]]; then journalctl -u hemlock -n 40 --no-pager || true; else tail -n 40 -- "$log" || true; fi
  die "$1; nginx is unchanged"
}
if (( SYSTEM )); then
  run systemctl daemon-reload
  run systemctl enable --quiet hemlock
  # Type=exec: a service that dies before it runs node (226/NAMESPACE) fails the restart itself.
  run systemctl restart hemlock || not_serving "hemlock did not start"
else
  run systemctl --root="$PREFIX" enable --quiet hemlock
  # In place of the restart, the built server runs with the unit's environment, pointed into PREFIX.
  mapfile -t unit_env < <(sed -n 's/^Environment=//p' deploy/hemlock.service)
  log=$PREFIX/var/log/hemlock.log
  printf '+ %s\n' "env -i PATH=$PATH ${unit_env[*]} DATA_DIR=$DATA PORT=$PORT $NODE server/src/index.js >$log 2>&1 &"
  if [[ $DRY_RUN != 1 ]]; then
    mkdir -p -- "${log%/*}"
    env -i PATH="$PATH" "${unit_env[@]}" DATA_DIR="$DATA" PORT="$PORT" \
      "$NODE" server/src/index.js >"$log" 2>&1 &
    server=$!
  fi
fi
if [[ $DRY_RUN != 1 ]] && ! wait_healthy "http://127.0.0.1:$PORT/api/health"; then
  not_serving "hemlock is not answering on 127.0.0.1:$PORT"
fi

say "nginx"
site=$NGINX/sites-available/hemlock
link=$NGINX/sites-enabled/hemlock
default=$NGINX/sites-enabled/default
had_link=0
[[ ! -L $link ]] || had_link=1
if [[ -f $site && $DRY_RUN != 1 ]]; then
  saved=$(mktemp)
  cp -- "$site" "$saved"
fi
run install -D -m 0644 deploy/nginx/hemlock.conf "$site"
run mkdir -p -- "$NGINX/sites-enabled"
run ln -sfn ../sites-available/hemlock "$link"
# Debian's stock site also claims default_server on port 80.
default_target=""
if [[ -L $default && $(readlink -- "$default") == */sites-available/default ]]; then
  default_target=$(readlink -- "$default")
  run rm -- "$default"
fi
if (( SYSTEM )); then
  if ! run nginx -t; then
    if [[ -n $saved ]]; then
      cp -- "$saved" "$site"
      (( had_link )) || rm -f -- "$link"
    else
      rm -f -- "$site" "$link"
    fi
    [[ -z $default_target ]] || ln -s -- "$default_target" "$default"
    die "nginx rejected the configuration; the previous one is back in place"
  fi
  run systemctl reload-or-restart nginx
  if [[ $DRY_RUN != 1 ]]; then
    wait_healthy "http://127.0.0.1/api/health" || die "nginx on port 80 does not reach hemlock"
  fi
fi

# Only a deploy that answers prunes, so reruns of a failing one never push out an older backup.
say "Old backups"
if [[ -d $DATA/backups ]]; then
  mapfile -t old < <(find "$DATA/backups" -maxdepth 1 -name 'hemlock-*.db' -printf '%f\n' |
    sort | head -n -"$KEEP")
  for f in "${old[@]}"; do
    s=${f#hemlock-}
    s=${s%.db}
    run rm -rf -- "$DATA/backups/$f" "$DATA/backups/covers-$s"
  done
fi
say "Done"
