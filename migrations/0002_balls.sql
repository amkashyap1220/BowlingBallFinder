-- Migration 0002: the ball list. Shared by everyone (not anyone's own data).
-- Specs are the maker's, for the 16 lb ball, copied from source_url.
-- The rows come from data/balls.csv via a generated seed migration
-- (npm run balls:sql; see scripts/balls-sql.mjs).

CREATE TABLE balls (
  id              INTEGER PRIMARY KEY,
  brand           TEXT NOT NULL,                 -- e.g. "Storm", "Roto Grip"
  name            TEXT NOT NULL,                 -- e.g. "Phaze II"
  line            TEXT,                          -- the maker's tier, as they write it ("Premier", "High", ...)
  release_date    TEXT,                          -- YYYY-MM-DD; empty when the maker doesn't say
  core_name       TEXT,
  core_type       TEXT NOT NULL CHECK (core_type IN ('symmetric', 'asymmetric')),
  rg              REAL NOT NULL CHECK (rg BETWEEN 2.40 AND 2.70),
  differential    REAL NOT NULL CHECK (differential BETWEEN 0 AND 0.080),
  mass_bias       REAL CHECK (mass_bias BETWEEN 0 AND 0.030),   -- intermediate diff; asymmetric only
  coverstock_name TEXT,
  coverstock_type TEXT NOT NULL CHECK (coverstock_type IN ('solid', 'pearl', 'hybrid', 'urethane', 'polyester')),
  surface         TEXT,                          -- factory surface as the maker writes it
  surface_grit    INTEGER,                       -- last grit in that surface, when it names one
  finish          TEXT NOT NULL CHECK (finish IN ('sanded', 'polished')),
  status          TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'discontinued')),
  source_url      TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  notes           TEXT,                          -- anything odd about the maker's numbers
  UNIQUE (brand, name)
);

CREATE INDEX balls_release_date ON balls (release_date);
