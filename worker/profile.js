/* ==========================================================================
   Your game: the signed-in person's answers and estimated profile
   (the profiles table, migrations/0004_profiles.sql).

     GET /api/profile   your latest answers and the profile worked out from them
     PUT /api/profile   save new answers: { "answers": { ... } }

   Every save adds a row, so earlier answers are kept. Everything here is
   looked up by the signed-in person's user id, never by anything sent in.
   ========================================================================== */

import { json } from "./api.js";
import { upsertUser } from "./users.js";
import { cleanAnswers, estimateProfile } from "../src/lib/profile.js";

const MAX_BODY = 20_000;   // bytes; the answers are far smaller

/** The person's latest saved answers row, or null. */
export async function latestProfile(db, userId) {
  return db
    .prepare("SELECT id, answers, created_at FROM profiles WHERE user_id = ?1 ORDER BY id DESC LIMIT 1")
    .bind(userId)
    .first();
}

/** Saves a new set of (already cleaned) answers for the person. */
export async function saveProfile(db, userId, answers) {
  return db
    .prepare("INSERT INTO profiles (user_id, answers) VALUES (?1, ?2) RETURNING id, answers, created_at")
    .bind(userId, JSON.stringify(answers))
    .first();
}

function reply(row) {
  if (!row) return json({ answers: null, savedAt: null, profile: null });
  const answers = JSON.parse(row.answers);
  return json({ answers, savedAt: row.created_at, profile: estimateProfile(answers) });
}

export async function getProfileRoute(request, env, email) {
  const user = await upsertUser(env.DB, email);
  return reply(await latestProfile(env.DB, user.id));
}

export async function putProfileRoute(request, env, email) {
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: "That's too much to save." }, 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "The request wasn't valid JSON." }, 400);
  }
  const clean = cleanAnswers(body?.answers);
  if (!clean.ok) return json({ error: clean.error }, 400);
  const user = await upsertUser(env.DB, email);
  return reply(await saveProfile(env.DB, user.id, clean.answers));
}
