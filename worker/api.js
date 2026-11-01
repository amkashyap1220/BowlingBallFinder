/* ==========================================================================
   The app's JSON API, under /api/. The person is already signed in and
   checked (access.js) before anything here runs: handlers get their email
   and must never take who someone is from the request body or query.

     GET /api/me          the signed-in person (creates their row on first visit)
     GET /api/balls       the ball list, with filters (balls.js)
     GET /api/balls/:id   one ball

   Later milestones add their routes to ROUTES (see docs/PLAN.md).
   ========================================================================== */

import { upsertUser } from "./users.js";
import { ballsRoute, ballRoute } from "./balls.js";

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function me(request, env, email) {
  const user = await upsertUser(env.DB, email);
  return json({ user: { id: user.id, email: user.email, name: user.name, createdAt: user.created_at } });
}

// "METHOD /path" -> handler(request, env, email, params). A path segment
// written ":name" matches any one segment and arrives as params.name.
const ROUTES = {
  "GET /api/me": me,
  "GET /api/balls": ballsRoute,
  "GET /api/balls/:id": ballRoute,
};

/** The route's params if `pattern` (e.g. "/api/balls/:id") matches `pathname`, else null. */
function match(pattern, pathname) {
  const want = pattern.split("/");
  const got = pathname.split("/");
  if (want.length !== got.length) return null;
  const params = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(":")) {
      if (!got[i]) return null;
      try {
        params[want[i].slice(1)] = decodeURIComponent(got[i]);
      } catch {
        return null;   // not valid %-encoding
      }
    } else if (want[i] !== got[i]) return null;
  }
  return params;
}

export async function handleApi(request, env, email) {
  const { pathname } = new URL(request.url);
  let handler, params, pathKnown = false;
  for (const [key, fn] of Object.entries(ROUTES)) {
    const [method, pattern] = key.split(" ");
    const p = match(pattern, pathname);
    if (!p) continue;
    pathKnown = true;
    if (method === request.method) {
      handler = fn;
      params = p;
      break;
    }
  }
  if (!handler) return pathKnown ? json({ error: "Method not allowed" }, 405) : json({ error: "Not found" }, 404);
  try {
    return await handler(request, env, email, params);
  } catch (err) {
    console.error(`${request.method} ${pathname} failed:`, err);
    const setup = /no such table/i.test(String(err?.message));
    return json({ error: setup ? "The database isn't set up yet: run the migrations (docs/SETUP.md)." : "Something went wrong." }, 500);
  }
}
