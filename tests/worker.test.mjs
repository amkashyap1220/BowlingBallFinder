// The Worker end to end: sign-in check, then the API or the built files
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
import { testDb } from "./helpers/d1.mjs";
import { makeSigner, stubCerts, claimsFor, settings } from "./helpers/access.mjs";

const signer = await makeSigner();
const assets = { fetch: async (r) => new Response("file: " + new URL(r.url).pathname) };

async function call(path, { email = "alex@example.com", method = "GET", env = {} } = {}) {
  const headers = email ? { "Cf-Access-Jwt-Assertion": await signer.sign(claimsFor(email)) } : {};
  return worker.fetch(new Request("https://bowling.alexanderk.dev" + path, { method, headers }), { ...settings(), ASSETS: assets, ...env });
}

test("signed-in people get pages; everyone else gets nothing", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const ok = await call("/", { env: { DB: testDb() } });
  assert.equal(await ok.text(), "file: /");
  for (const path of ["/", "/api/me", "/css/app.css"]) {
    assert.equal((await call(path, { email: null })).status, 403, path);
  }
});

test("GET /api/me creates the person's row once and returns it", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const db = testDb();
  const first = await (await call("/api/me", { env: { DB: db } })).json();
  const again = await (await call("/api/me", { env: { DB: db } })).json();
  assert.equal(first.user.email, "alex@example.com");
  assert.equal(again.user.id, first.user.id);
  assert.equal(db.raw.prepare("SELECT count(*) AS n FROM users").get().n, 1);

  const friend = await (await call("/api/me", { email: "friend@example.com", env: { DB: db } })).json();
  assert.notEqual(friend.user.id, first.user.id);
});

test("unknown API routes are 404, wrong methods 405", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  assert.equal((await call("/api/nope", { env: { DB: testDb() } })).status, 404);
  assert.equal((await call("/api/me", { method: "DELETE", env: { DB: testDb() } })).status, 405);
});

test("a database without its tables says to run the migrations", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const empty = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error("D1_ERROR: no such table: users"); } }) }) };
  const res = await call("/api/me", { env: { DB: empty } });
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /migrations/);
});
