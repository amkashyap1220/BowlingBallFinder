# Setting it up on Cloudflare

One-time steps in the Cloudflare dashboard that code can't do. Until steps 3
and 4 are done, the app answers every visit with "Not set up yet" instead of
showing anything, so it's safe to deploy first.

Cloudflare renames menus now and then: if a name below doesn't match, look for
the nearest equivalent.

## 1. Deploy the Worker from GitHub

1. Merge the milestone 0 pull request into `main`.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a
   repository** → pick `amkashyap1220/BowlingBallFinder`.
3. Project name: **`bowlingballfinder`** (must match `name` in `wrangler.jsonc`).
4. Build settings:
   - Build command: leave empty (the deploy runs `npm run build` itself)
   - Deploy command:
     ```
     npx wrangler deploy && npx wrangler d1 migrations apply DB --remote
     ```
     This deploys, then adds any new database tables from `migrations/`.
5. Save and deploy. The first deploy also:
   - creates the **`bowlingballfinder`** D1 database
   - creates **bowling.alexanderk.dev** (DNS and certificate), because
     alexanderk.dev is already on Cloudflare

If the migrations step fails with a permissions error, the build's API token
needs **D1: Edit**: Worker → Settings → Builds → API token, then edit that
token under My Profile → API Tokens.

## 2. Put Cloudflare Access in front of it

1. Open **Zero Trust** from the dashboard sidebar (one.dash.cloudflare.com).
   The first time, it asks for a team name (this becomes
   `<team>.cloudflareaccess.com`) and a plan: choose **Free** (up to 50 users).
2. **Access → Applications → Add an application → Self-hosted**.
   - Name: Bowling Ball Finder
   - Domain: `bowling.alexanderk.dev` (no path)
   - Session duration: e.g. 1 month, so the three of you don't sign in often
3. Add a policy:
   - Name: The three of us
   - Action: **Allow**
   - Include → **Emails**: the three email addresses
4. Login methods: **One-time PIN** (on by default) is all you need. Access
   emails a code to the address; no passwords.
5. Save, then open the application and copy its **Application Audience (AUD)
   Tag** (on its overview or basic information).

## 3. Give the Worker its settings

Worker `bowlingballfinder` → **Settings → Variables and Secrets** → add each as
type **Secret** (secrets survive every deploy):

| Name | Value |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` (from step 2.1; the team name alone works too) |
| `ACCESS_AUD` | the AUD tag from step 2.5 |
| `ALLOWED_EMAILS` | the same three emails, comma-separated |

`ALLOWED_EMAILS` repeats the Access policy on purpose: the Worker checks it
too, so loosening the Access policy by mistake doesn't open the app.

## 4. Check it

1. Open https://bowling.alexanderk.dev in a private window.
2. Access asks for your email and sends a code. Enter it.
3. You should see the home page with **Signed in as you@…** in the header.
4. Try an email that isn't on the list: Access refuses it.

| You see | Fix |
| --- | --- |
| "Not set up yet. Missing Worker settings: …" | Add the settings it names (step 3) |
| "Your sign-in couldn't be checked. The ACCESS_… setting doesn't match …" | Set that setting to the value the message shows (it comes from your own sign-in) |
| "Your sign-in couldn't be checked. Couldn't load the … signing keys" | `ACCESS_TEAM_DOMAIN` isn't a real team domain: copy it from Zero Trust > Settings |
| "… isn't on this app's list of users" | Add the email to `ALLOWED_EMAILS` |
| Header says "The database isn't set up yet" | Run the migrations: redeploy, or `npx wrangler d1 migrations apply DB --remote` |
| The page loads with no sign-in prompt | The Access application's domain doesn't match `bowling.alexanderk.dev` |

Every refused sign-in is also logged with its reason: Worker → **Observability**
(or **Logs**), search for `access token rejected`.

## Adding or removing a person

Change both the Access policy's emails (step 2.3) and `ALLOWED_EMAILS` (step 3).
