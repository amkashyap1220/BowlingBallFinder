// The sign-in check (worker/access.js): only valid Access tokens for listed emails get in
import test from "node:test";
import assert from "node:assert/strict";
import { authenticate, verifyAccessToken, missingSettings, issuerFor } from "../worker/access.js";
import { TEAM, AUD, makeSigner, stubCerts, claimsFor, settings } from "./helpers/access.mjs";

const signer = await makeSigner();
const req = (token, path = "/") =>
  new Request("https://bowling.alexanderk.dev" + path, { headers: token ? { "Cf-Access-Jwt-Assertion": token } : {} });

test("a valid token for a listed email gets in, lowercased", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const r = await authenticate(req(await signer.sign(claimsFor("FRIEND@example.com"))), settings());
  assert.deepEqual(r, { ok: true, email: "friend@example.com" });
});

test("the signing keys are fetched once and reused", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  for (let i = 0; i < 3; i++) await authenticate(req(await signer.sign(claimsFor("alex@example.com"))), settings());
  assert.equal(certs.count, 1);
});

test("refused: no token, an unlisted email, or a token that fails any check", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const other = await makeSigner("key-1");   // same key id, different key: a forgery
  const now = Math.floor(Date.now() / 1000);
  const bad = {
    "no token": null,
    "unlisted email": await signer.sign(claimsFor("stranger@example.com")),
    "forged signature": await other.sign(claimsFor("alex@example.com")),
    "another application": await signer.sign(claimsFor("alex@example.com", { aud: ["someone-else"] })),
    "another team": await signer.sign(claimsFor("alex@example.com", { iss: "https://evil.cloudflareaccess.com" })),
    "expired": await signer.sign(claimsFor("alex@example.com", { exp: now - 3600 })),
    "not valid yet": await signer.sign(claimsFor("alex@example.com", { nbf: now + 3600 })),
    "no email": await signer.sign(claimsFor(undefined)),
    "alg none": (await signer.sign(claimsFor("alex@example.com"), { alg: "none" })),
    "unknown key id": await signer.sign(claimsFor("alex@example.com"), { kid: "nope" }),
    "garbage": "not.a.token",
  };
  for (const [why, token] of Object.entries(bad)) {
    const r = await authenticate(req(token), settings());
    assert.equal(r.ok, false, why);
    assert.equal(r.response.status, 403, why);
  }
});

test("API requests are refused with JSON, pages with HTML", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const api = await authenticate(req(null, "/api/me"), settings());
  assert.match(api.response.headers.get("Content-Type"), /json/);
  assert.ok((await api.response.json()).error);
  const page = await authenticate(req(null, "/"), settings());
  assert.match(page.response.headers.get("Content-Type"), /html/);
});

test("the app stays locked until every setting is filled in", async () => {
  assert.deepEqual(missingSettings({}), ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "ALLOWED_EMAILS"]);
  assert.deepEqual(missingSettings(settings({ ALLOWED_EMAILS: "  " })), ["ALLOWED_EMAILS"]);
  const r = await authenticate(req("anything"), { ACCESS_AUD: AUD });
  assert.equal(r.ok, false);
  assert.equal(r.response.status, 503);
});

test("DEV_FAKE_USER works locally but never once Access is set up", async (t) => {
  const local = await authenticate(req(null), { DEV_FAKE_USER: "Me@Example.com" });
  assert.deepEqual(local, { ok: true, email: "me@example.com" });

  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const deployed = await authenticate(req(null), settings({ DEV_FAKE_USER: "alex@example.com" }));
  assert.equal(deployed.ok, false);
});

test("the team domain can be written as the team name, the domain, or a full address", () => {
  for (const d of ["testteam", " TestTeam ", TEAM, "https://" + TEAM, TEAM + "/", "HTTPS://" + TEAM.toUpperCase() + "/", `https://${TEAM}/cdn-cgi/access/certs`]) {
    assert.equal(issuerFor(d), "https://" + TEAM, d);
  }
});

// What the refusal page says, for the setup mistakes that are easy to make
async function refusalText(token, env) {
  const r = await authenticate(req(token), env);
  assert.equal(r.ok, false);
  assert.equal(r.response.status, 403);
  return r.response.text();
}

test("a wrong ACCESS_TEAM_DOMAIN is named, with the team that signed you in", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const text = await refusalText(await signer.sign(claimsFor("alex@example.com")), settings({ ACCESS_TEAM_DOMAIN: "wrongteam.cloudflareaccess.com" }));
  assert.match(text, /ACCESS_TEAM_DOMAIN/);
  assert.match(text, new RegExp(TEAM.replace(/\./g, "\\.")));
  assert.equal(certs.count, 0, "refused before downloading any keys");
});

test("a wrong ACCESS_AUD is named, with the application's AUD tag from the token", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const text = await refusalText(await signer.sign(claimsFor("alex@example.com")), settings({ ACCESS_AUD: "copied-the-wrong-thing" }));
  assert.match(text, /ACCESS_AUD/);
  assert.match(text, new RegExp(AUD));
  assert.doesNotMatch(text, /copied-the-wrong-thing/, "never shows the setting's own value");
});

test("a team domain with no keys behind it says to check ACCESS_TEAM_DOMAIN", async (t) => {
  const certs = stubCerts([signer.jwk]);   // only serves keys for TEAM
  t.after(certs.restore);
  const other = "otherteam.cloudflareaccess.com";
  const token = await signer.sign(claimsFor("alex@example.com", { iss: "https://" + other }));
  const text = await refusalText(token, settings({ ACCESS_TEAM_DOMAIN: other }));
  assert.match(text, /signing keys/);
  assert.match(text, /ACCESS_TEAM_DOMAIN/);
});

test("matching team and application values never get a forged token in", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const forger = await makeSigner("key-1");
  const r = await authenticate(req(await forger.sign(claimsFor("alex@example.com"))), settings());
  assert.equal(r.ok, false);
  assert.match(await r.response.text(), /Sign out and sign in again/);
});

test("verifyAccessToken returns the token's claims", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const claims = await verifyAccessToken(await signer.sign(claimsFor("alex@example.com")), { teamDomain: TEAM, aud: AUD });
  assert.equal(claims.email, "alex@example.com");
});
