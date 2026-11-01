-- Migration 0001: the people who use the app.
-- Migrations run in order and are never edited after they ship: change the
-- schema by adding the next numbered file (see CLAUDE.md).

CREATE TABLE users (
  id           INTEGER PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,          -- lowercased, from Cloudflare Access
  name         TEXT,                          -- optional display name
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);
