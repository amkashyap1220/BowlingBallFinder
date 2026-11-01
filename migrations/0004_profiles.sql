-- Migration 0004: each person's answers to the "Your game" questions.
-- One row per save, so changes keep their history; the newest row is the
-- current one. Only the answers are stored: the estimated profile is worked
-- out from them when read (src/lib/profile.js), so tuning the numbers
-- updates everyone's profile.

CREATE TABLE profiles (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id),
  answers    TEXT NOT NULL CHECK (json_valid(answers)),   -- cleaned by cleanAnswers()
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX profiles_user ON profiles (user_id, id);
