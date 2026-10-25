-- Copyright (c) 2023 Hemlock
-- SPDX-License-Identifier: GPL-3.0-only

-- A secret's value is AES-256-GCM ciphertext (v1:<iv>:<tag>:<ciphertext>), never plain text.
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  secret     INTEGER NOT NULL CHECK (secret IN (0, 1)),
  updated_at TEXT NOT NULL
) STRICT;

-- token_hash is the hex SHA-256 of the cookie's token; the token itself is never stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;
