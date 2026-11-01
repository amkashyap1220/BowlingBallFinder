# Decisions

Choices already made, and why. Later sessions build on these instead of
reopening them. Add new ones at the bottom: what, why, and what was ruled out.

### 1. Its own repo and Worker, at bowling.alexanderk.dev
The app is separate from the alexanderk.dev site (its own repo, Worker and
deploys), reached from that site's Projects page. It can't break the main site,
and AI sessions here only ever see bowling code.
*Ruled out:* alexanderk.dev/bowling, which would need the main site's Worker to
forward requests and would tie the two deploys together.

### 2. Sign-in with Cloudflare Access (email one-time code)
Three users, so Access's free plan does it with no passwords or sign-in code to
maintain. The Worker still verifies Access's token on every request and checks
its own `ALLOWED_EMAILS` list, so the app stays locked if Access were ever
switched off or its policy loosened.
*Ruled out:* the main site's shared unlock code (no separate people), and
writing our own accounts (more to build and secure).

### 3. Cloudflare D1 for data, R2 for videos (from milestone 5)
D1 is SQLite on Cloudflare: real tables and joins for balls, profiles and
arsenals, inside the free tier. Videos go to R2 when milestone 5 adds them.

### 4. Astro + Svelte 5, styled like alexanderk.dev
Same tools and look as the main site, so nothing new to learn. Plain JS with
JSDoc comments, not TypeScript, to match the main site.

### 5. Recommendations from a scoring model, not machine learning
There's no dataset of "this bowler liked this ball" to learn from. Specs are
turned into reaction scores with hand-set weights, then tuned with the three
users' feedback. See docs/BOWLING.md.

### 6. Every number about the bowler is optional
Most bowlers don't know their rev rate or axis. The questions use things they
can see (where they stand, where the ball breaks, what goes wrong); measured
numbers from video or a pro shop replace the estimates when present.

### 7. Video measuring happens in the browser
The Worker can't process video. The browser steps through frames and the user
marks events (milestone 5); automatic tracking comes later (milestone 7).
Clips are kept in R2 so they can be measured again as the tools improve.

### 8. One milestone per AI session
To avoid one long conversation losing track ("context rot"), each session does
one milestone from docs/PLAN.md, starting from CLAUDE.md and the docs, and
leaves the docs up to date for the next.

### 9. Friends join by invite, not by signing up
More people are expected (friends), so milestone 8 lets the admin invite and
remove people inside the app, keeping one list in D1 and Cloudflare Access's
group in step through the API. Access's free plan covers up to 50 people.
*Ruled out for now:* open sign-up. It would mean replacing Access with our own
sign-in, upload limits and a privacy note; worth it only if the app goes
public. Because identity comes only from `worker/access.js`, that switch
changes that one file, not the pages, database or API.

### 10. Branch previews exist, but empty
Cloudflare builds every non-main branch with `npx wrangler preview`, which
fails without a `previews` block in `wrangler.jsonc`. The block is kept empty:
previews live outside Cloudflare Access, so they get no database, storage or
secrets and can only answer "Not set up yet". What they give is a build check
on every pull request. Testing the app itself happens locally
(`npm run preview`). `tests/config.test.mjs` fails if the block gains anything.

### 11. Ball data: a reviewed CSV, loaded by a generated seed migration
`data/balls.csv` is the source; `npm run balls:sql` writes it into a seed
migration as add-or-update by brand + name, so changes are diffable and every
database (local, tests, Cloudflare) gets the same rows through the normal
migrations. Specs are the 16 lb numbers from the maker's own page, never a
retailer's, and brands' own hook/flare ratings aren't stored. A migration
can't use bound parameters, so the generator writes escaped SQL literals; it
only ever reads the reviewed CSV, never a request. To change the data later,
edit the CSV, point the script at the next migration number, and run it.
*Ruled out:* loading the CSV at runtime (no file system in the Worker), and
hand-written SQL (easy to drift from the reviewed data).
