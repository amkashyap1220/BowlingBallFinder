# Plan

One milestone per session. Each has a goal, what's in it, and "done when".
Update the status and notes when a milestone finishes; add new ideas under
**Later** rather than growing a milestone.

To start a milestone, open a new session and say:

> Read CLAUDE.md and docs/PLAN.md, then do milestone N. Work on a branch and
> open a pull request when it's done.

| # | Milestone | Status |
| --- | --- | --- |
| 0 | Groundwork | ✅ Code done; dashboard setup in docs/SETUP.md |
| 1 | Ball list | Not started |
| 2 | Your game: questions → profile | Not started |
| 3 | Your arsenal | Not started |
| 4 | Recommendations | Not started |
| 5 | Measure from video | Not started |
| 6 | Keeping the ball list current | Not started |
| 7 | Automatic video tracking | Later |

---

## 0. Groundwork ✅

**Goal:** a deployed, signed-in, empty app that later milestones build on.

- Astro + Svelte site served by a Worker at bowling.alexanderk.dev
- Cloudflare Access sign-in, verified again in the Worker (`worker/access.js`)
- D1 database with a `users` table; `GET /api/me`
- Home page listing the sections to come; header shows who's signed in
- Tests: access token checks, Worker routing, the users table
- Docs: CLAUDE.md, PLAN, DECISIONS, BOWLING, SETUP
- alexanderk.dev: a Projects entry linking to the app

**Done when:** the three listed emails can sign in at bowling.alexanderk.dev and
see "Signed in as …"; anyone else can't. (Needs the dashboard steps in SETUP.md.)

**Notes:** Local check passed: `wrangler dev` with a local D1 serves the pages
and `/api/me`, and stays locked (503) when settings are missing.

---

## 1. Ball list

**Goal:** every current high-end ball, with specs, browsable and filterable.

- Migration `0002_balls.sql`: `balls` table. Fields in docs/BOWLING.md
  ("Ball data"): brand, name, release date, core (symmetric/asymmetric), RG,
  differential, mass bias (intermediate diff), coverstock name and type, factory
  surface, finish, line/tier, status (current/discontinued), source URL
- Seed data as a reviewed file in the repo (`data/balls.csv` or `.json`) and a
  script that turns it into a seed migration or SQL, so the data is diffable
- About 40 current balls to start, across Storm/Roto Grip/900 Global,
  Brunswick/Hammer/Ebonite/DV8/Radical/Track, Motiv, Columbia 300. Record every
  number from the maker's own spec page, with its URL
- `GET /api/balls` (filters: brand, cover type, core type, released after);
  `GET /api/balls/:id`
- Page `/balls`: a sortable table on desktop, cards on phones; filters
- Tests: the migration, the seed loads, the filters

**Done when:** all three users can browse and filter the list; every ball shows
where its specs came from.

## 2. Your game: questions → profile

**Goal:** a bowler who knows none of their numbers can describe their game, and
the app turns it into an estimated profile.

- The questions in docs/BOWLING.md ("The questions"); every number optional
- `src/lib/profile.js` (pure): answers → estimated ranges for speed, rev rate,
  rev-to-speed match-up and hook, each with a confidence. Unit-tested with
  example bowlers (a stroker, a tweener, a cranker, a two-hander)
- Migration: `profiles` (one row per user per save, so changes keep history)
- `GET/PUT /api/profile`; page `/profile` with the questions and the result
- Measured numbers (video, or a pro shop's) replace the estimates when present

**Done when:** each user can save their answers and see a profile that reads
right to them.

## 3. Your arsenal

- Migration: `arsenal` (user_id, ball_id, surface they use, layout optional,
  "how it reads for me" notes, retired flag)
- `GET/POST/PATCH/DELETE /api/arsenal`; page `/arsenal`: search the ball list
  and add, set surface, notes
- Tests, including that one user can never see or change another's balls

**Done when:** each user's arsenal is saved and editable.

## 4. Recommendations

- `src/lib/score.js` (pure): ball specs + surface → reaction scores (hook,
  length, backend shape), per docs/BOWLING.md ("Scoring")
- Plot the user's arsenal on those scores, find the gaps, rank balls that fill
  them for this bowler's profile and conditions; a written reason for each pick
- Page `/recommendations`: top 3–5 with reasons; a hook-vs-length chart of the
  arsenal and picks (Observable Plot, pinned version)
- Tests: scoring on known balls, gap finding, ranking on example bowlers
- The weights are a first guess: keep them in one clearly named object so they
  can be tuned with feedback from the three users

**Done when:** recommendations for each user look sensible to them, with reasons.

## 5. Measure from video

- Upload a slow-motion clip; store it in R2 (new binding) under the user's id
- In the browser, step frame by frame; the user marks the release frame, the
  pin-hit frame, and each full turn of a mark on the ball
- `src/lib/video.js` (pure): fps + frames → ball speed and rev rate. Ask the
  user to confirm the fps (browsers can't read it reliably)
- Recording tips on the page (docs/BOWLING.md, "Video")
- Save measurements to the profile; they replace the estimates

**Done when:** a user can film a shot, measure it, and see their profile update.

## 6. Keeping the ball list current

- A way for the admin (Alexander) to add or update balls: an admin-only form or
  a CSV import; admin = an `ADMIN_EMAILS` setting
- Mark discontinued balls; "new this month" on the ball list

## 7. Automatic video tracking (later)

- Find the ball and a tape mark in each frame (OpenCV.js in the browser) and
  count turns automatically; the user confirms the result
- Possibly axis rotation/tilt estimates; research-level, see docs/BOWLING.md

---

## Later

Ideas noticed along the way that don't belong to a milestone yet.

- Name field on first sign-in (users.name exists, nothing sets it yet)
