# Bowling Ball Finder: notes for AI sessions

A private web app at **bowling.alexanderk.dev** for three bowlers. Each person
signs in, describes how they bowl (questions, and later video), lists the balls
they own, and gets ball recommendations that fill the gap in their arsenal.
It's linked from the Projects page of alexanderk.dev (a separate repo).

## How work happens here (read this first)

This project is built **one milestone per session**, so no session has to carry
the whole project in its context.

1. Read this file, then `docs/PLAN.md`. Find the milestone you were asked to do.
2. Read only the docs and files that milestone needs. `docs/BOWLING.md` holds the
   bowling knowledge (ball specs, the questions, the scoring idea, video
   measurement); `docs/DECISIONS.md` holds choices already made. **Don't reopen
   a decision** unless the user asks; if one really blocks you, say so.
3. Do that milestone and nothing beyond it. Note anything else you spot under
   "Later" in `docs/PLAN.md` instead of doing it.
4. Before you finish: `npm test` passes, `npm run build` works, `docs/PLAN.md`
   shows the milestone's status and notes, any new decision is in
   `docs/DECISIONS.md`, and this file's map below is still true.
5. Work on a branch, and open a pull request when the user asks for one.

## Map

| Where | What |
| --- | --- |
| `worker/index.js` | Worker entry: every request is checked by `access.js`, then goes to `api.js` (`/api/*`) or the built files |
| `worker/access.js` | Who is signed in: verifies the Cloudflare Access token and the `ALLOWED_EMAILS` list. The **only** place identity comes from |
| `worker/api.js` | The JSON API: `ROUTES` maps `"METHOD /path"` (`:id` segments allowed) to handlers `(request, env, email, params)` |
| `worker/users.js` | The `users` table |
| `worker/balls.js` | The ball list: `GET /api/balls` (filters) and `/api/balls/:id` |
| `migrations/` | D1 (SQLite) schema, numbered files, applied in order. `0003_balls_seed.sql` is generated |
| `data/balls.csv` | The ball list's reviewed source data (maker's specs + source URL per ball) |
| `scripts/balls-sql.mjs` | `npm run balls:sql`: CSV → seed migration (DECISIONS.md #11) |
| `src/lib/` | Pure logic, no DOM or `env`: `balls-data.js` reads/checks the CSV and builds the seed SQL |
| `src/layouts/AppLayout.astro` | Page shell: head, header (`NAV`), footer |
| `src/pages/` | One `.astro` file per page; its path is its address |
| `src/components/` | Svelte 5 components for the interactive parts |
| `public/css/app.css` | All styles (same tokens and look as alexanderk.dev) |
| `tests/` | `node --test`; `config.test.mjs` guards the privacy settings in `wrangler.jsonc`; `tests/helpers/d1.mjs` is an in-memory D1 with all migrations applied, `helpers/access.mjs` fakes Access tokens |
| `docs/` | `PLAN.md` milestones, `DECISIONS.md`, `BOWLING.md` domain knowledge, `SETUP.md` Cloudflare dashboard steps |

## Commands

- `npm install`, then `npm test` (unit tests; no build needed) and `npm run build`
- `npm run preview`: build and run the real Worker locally at http://localhost:8787.
  First time: `cp .dev.vars.example .dev.vars` and `npm run db:migrate:local`.
  `DEV_FAKE_USER` in `.dev.vars` signs you in locally (it's ignored whenever
  `ACCESS_AUD` is set, so it can't open the deployed app)
- `npm run dev`: Astro only (pages, no Worker or API); fine for layout work
- `npm run balls:sql`: after editing `data/balls.csv`, regenerate the seed migration
- `npm run db:migrate:remote`: apply migrations to the real database (the
  deploy also does this; see `docs/SETUP.md`)

## Rules

- **Security.** Every request goes through `access.js` (`run_worker_first: true`).
  API handlers get `email` from it; never read identity from the body, query or
  a client header. Every query on someone's data filters by their `user_id`.
  No `workers.dev` or version preview URLs (they'd skip Access). Branch
  previews (`"previews": {}` in `wrangler.jsonc`) stay empty: no bindings or
  secrets, so they're locked. `tests/config.test.mjs` checks all of this.
- **Database.** Never edit a migration that has shipped; add the next number
  (`0002_balls.sql`, ...). Use `?1`-style bound parameters, never string-built SQL.
  Each new table gets a test using `tests/helpers/d1.mjs`.
- **Logic stays pure and tested.** Scoring, profile estimates and video math
  live in plain JS modules with no DOM or `env` (e.g. `src/lib/score.js`), so
  they're testable with `node --test` and usable from both pages and Worker.
- **Small files.** One Svelte component per screen or panel; one Worker module
  per area (`balls.js`, `profile.js`, ...), registered in `api.js` `ROUTES`.
- **Front end.** Astro pages + Svelte 5 (runes: `$state`, `$derived`, `$props`).
  Use the tokens in `app.css`; no new CSS frameworks. Pages must work at phone
  width (390px) with no sideways scrolling, in light and dark.
- **Dependencies** are pinned to exact versions. Ask before adding one.
- **Writing.** Comments and docs explain what and why, briefly, in plain words
  (see the file headers). User-facing text is plain language a bowler would use.
- No model names or AI-tool identifiers in code, commits or docs.
