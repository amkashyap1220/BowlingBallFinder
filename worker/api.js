/* ==========================================================================
   The app's JSON API, under /api/. The person is already signed in and
   checked (access.js) before anything here runs: handlers get their email
   and must never take who someone is from the request body or query.

     GET /api/me    the signed-in person (creates their row on first visit)

   Later milestones add their routes to ROUTES (see docs/PLAN.md).
   ========================================================================== */

import { upsertUser } from "./users.js";

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function me(request, env, email) {
  const user = await upsertUser(env.DB, email);
  return json({ user: { id: user.id, email: user.email, name: user.name, createdAt: user.created_at } });
}

// "METHOD /path" -> handler(request, env, email)
const ROUTES = {
  "GET /api/me": me,
};

export async function handleApi(request, env, email) {
  const { pathname } = new URL(request.url);
  const handler = ROUTES[`${request.method} ${pathname}`];
  if (!handler) {
    const known = Object.keys(ROUTES).some((r) => r.endsWith(" " + pathname));
    return known ? json({ error: "Method not allowed" }, 405) : json({ error: "Not found" }, 404);
  }
  try {
    return await handler(request, env, email);
  } catch (err) {
    console.error(`${request.method} ${pathname} failed:`, err);
    const setup = /no such table/i.test(String(err?.message));
    return json({ error: setup ? "The database isn't set up yet: run the migrations (docs/SETUP.md)." : "Something went wrong." }, 500);
  }
}
