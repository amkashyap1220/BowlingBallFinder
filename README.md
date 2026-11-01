# Bowling Ball Finder

A web app that helps serious bowlers find the next ball for their arsenal. You
describe how you bowl (in plain words, or by filming a shot), list the balls you
already own, and it recommends the balls that fill the gap: the reaction you
don't have yet, for how and where you bowl.

**Live:** [bowling.alexanderk.dev](https://bowling.alexanderk.dev) (private: sign-in required)

It's being built in milestones; see [docs/PLAN.md](docs/PLAN.md) for what's done
and what's next.

## How it's built

[Astro](https://astro.build) pages with [Svelte](https://svelte.dev) components,
served by a Cloudflare Worker that checks every request against
[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/)
sign-in. Data lives in Cloudflare D1 (SQLite).

| Where | What |
| --- | --- |
| `worker/` | The Worker: sign-in check, JSON API, database access |
| `migrations/` | The database tables |
| `src/` | Pages, layout and Svelte components |
| `public/` | Styles and icons |
| `tests/` | `npm test` |
| `docs/` | The plan, decisions, bowling notes, and Cloudflare setup |

## Running it

```sh
npm install
npm test                       # unit tests
cp .dev.vars.example .dev.vars # sign in as a test user locally
npm run db:migrate:local       # create the local database
npm run preview                # build and run at http://localhost:8787
```

Setting it up on Cloudflare: [docs/SETUP.md](docs/SETUP.md).

I used AI to help build this project.
