-- Copyright (c) 2023 Hemlock
-- SPDX-License-Identifier: GPL-3.0-only

-- password_hash is scrypt$N$r$p$salt$hash (server/src/auth.js), never the password.
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  last_login_at TEXT
) STRICT;

-- token_hash is the hex SHA-256 of the hemlock_session cookie's token; the token itself is never stored.
CREATE TABLE user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;

CREATE INDEX user_sessions_user ON user_sessions (user_id);

-- A paired television; token_hash is the hex SHA-256 of the token it sends as Authorization: Bearer.
CREATE TABLE devices (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT
) STRICT;
