// Your game: the profiles table and GET/PUT /api/profile
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
import { latestProfile, saveProfile } from "../worker/profile.js";
import { upsertUser } from "../worker/users.js";
import { blankAnswers } from "../src/lib/profile.js";
import { testDb } from "./helpers/d1.mjs";
import { makeSigner, stubCerts, claimsFor, settings } from "./helpers/access.mjs";

const signer = await makeSigner();
const TWEENER = { stand: 24, target: 12, breakpoint: 7, hands: "one", style: "tweener", problems: ["none"], speedBand: "medium" };

async function call(path, { email = "alex@example.com", method = "GET", body, env } = {}) {
  const headers = { "Cf-Access-Jwt-Assertion": await signer.sign(claimsFor(email)) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const init = { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) };
  return worker.fetch(new Request("https://bowling.alexanderk.dev" + path, init), { ...settings(), ...env });
}

/* ---------- The table ---------- */

test("profiles keep every save; the newest is the current one", async () => {
  const db = testDb();
  const user = await upsertUser(db, "alex@example.com");
  assert.equal(await latestProfile(db, user.id), null);
  await saveProfile(db, user.id, { ...blankAnswers(), stand: 20 });
  await saveProfile(db, user.id, { ...blankAnswers(), stand: 25 });
  assert.equal(JSON.parse((await latestProfile(db, user.id)).answers).stand, 25);
  assert.equal(db.raw.prepare("SELECT count(*) AS n FROM profiles WHERE user_id = ?").get(user.id).n, 2);
});

test("the table refuses rows with no person or answers that aren't JSON", () => {
  const db = testDb();
  db.raw.exec("PRAGMA foreign_keys = ON");
  assert.throws(() => db.raw.prepare("INSERT INTO profiles (user_id, answers) VALUES (999, '{}')").run(), /FOREIGN KEY/);
  db.raw.prepare("INSERT INTO users (email) VALUES ('a@example.com')").run();
  assert.throws(() => db.raw.prepare("INSERT INTO profiles (user_id, answers) VALUES (1, 'not json')").run(), /CHECK/);
});

/* ---------- API ---------- */

test("GET /api/profile is empty before the first save", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const body = await (await call("/api/profile", { env: { DB: testDb() } })).json();
  assert.deepEqual(body, { answers: null, savedAt: null, profile: null });
});

test("PUT /api/profile saves the answers and returns the profile; GET reads it back", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const env = { DB: testDb() };
  const saved = await call("/api/profile", { method: "PUT", body: { answers: TWEENER }, env });
  assert.equal(saved.status, 200);
  const s = await saved.json();
  assert.equal(s.answers.stand, 24);
  assert.equal(s.profile.matchUp.key, "balanced");
  assert.ok(s.savedAt);

  const read = await (await call("/api/profile", { env })).json();
  assert.deepEqual(read.answers, s.answers);
  assert.equal(read.profile.hook.label, "moderate hook");
});

test("one person never sees another's answers", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const env = { DB: testDb() };
  await call("/api/profile", { method: "PUT", body: { answers: TWEENER }, env });
  const friend = await (await call("/api/profile", { email: "friend@example.com", env })).json();
  assert.equal(friend.answers, null);

  await call("/api/profile", { email: "friend@example.com", method: "PUT", body: { answers: { ...TWEENER, stand: 30 } }, env });
  const mine = await (await call("/api/profile", { env })).json();
  assert.equal(mine.answers.stand, 24);
});

test("who you are comes from the sign-in, not the body", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const env = { DB: testDb() };
  await call("/api/profile", { method: "PUT", body: { answers: TWEENER, email: "friend@example.com", user_id: 2 }, env });
  const friend = await (await call("/api/profile", { email: "friend@example.com", env })).json();
  assert.equal(friend.answers, null);
});

test("PUT /api/profile refuses bad answers, bad JSON and huge bodies", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const env = { DB: testDb() };
  const bad = await call("/api/profile", { method: "PUT", body: { answers: { stand: 99 } }, env });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /stand/);
  assert.equal((await call("/api/profile", { method: "PUT", body: "{nope", env })).status, 400);
  assert.equal((await call("/api/profile", { method: "PUT", body: {}, env })).status, 400);
  assert.equal((await call("/api/profile", { method: "PUT", body: { answers: { pap: "x".repeat(30000) } }, env })).status, 413);
  assert.equal(env.DB.raw.prepare("SELECT count(*) AS n FROM profiles").get().n, 0);
});

test("other methods on /api/profile are 405, and it needs a sign-in", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  assert.equal((await call("/api/profile", { method: "DELETE", env: { DB: testDb() } })).status, 405);
  const res = await worker.fetch(new Request("https://bowling.alexanderk.dev/api/profile"), { ...settings(), DB: testDb() });
  assert.equal(res.status, 403);
});
