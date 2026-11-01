/* ==========================================================================
   Who is signed in: Cloudflare Access.

   Cloudflare Access sits in front of bowling.alexanderk.dev. It asks for an
   email address, sends a one-time code to it, and lets through only the
   addresses on its list. Every request it lets through carries a signed
   token (the Cf-Access-Jwt-Assertion header) naming the person.

   This file checks that token on EVERY request (pages, files and API) before
   anything is served, so the app stays locked even if Access were switched
   off or misconfigured. Nothing else in the Worker decides who someone is.

   Settings (Worker > Settings > Variables and Secrets; see docs/SETUP.md):
     ACCESS_TEAM_DOMAIN   e.g. "alexanderk.cloudflareaccess.com"
     ACCESS_AUD           the Access application's "Application Audience (AUD) Tag"
     ALLOWED_EMAILS       comma-separated; a second list, checked here too

   Local development only (.dev.vars, never in Cloudflare):
     DEV_FAKE_USER        an email to act as. Ignored whenever ACCESS_AUD is
                          set, so it can never open the deployed app.
   ========================================================================== */

const REQUIRED = ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "ALLOWED_EMAILS"];
const KEYS_TTL_MS = 60 * 60 * 1000;   // Access rotates its signing keys rarely; refetch hourly
const CLOCK_SKEW_S = 60;

/** The settings that are still missing (empty when the app is set up). */
export function missingSettings(env) {
  return REQUIRED.filter((name) => !String(env[name] ?? "").trim());
}

/**
 * The team's address, however the setting was written:
 * "alexanderk", "Alexanderk.cloudflareaccess.com/", "https://alexanderk.cloudflareaccess.com/cdn-cgi/..."
 * all give "https://alexanderk.cloudflareaccess.com".
 */
export function issuerFor(teamDomain) {
  let host = String(teamDomain).trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  if (host && !host.includes(".")) host += ".cloudflareaccess.com";   // just the team name
  return "https://" + host;
}

export function allowedEmails(env) {
  return String(env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/* ---------- Access's public signing keys, cached per team ---------- */

const keyCache = new Map();   // issuer -> { fetchedAt, keys: Map<kid, CryptoKey> }

async function loadKeys(issuer) {
  let keys;
  try {
    const res = await fetch(issuer + "/cdn-cgi/access/certs");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ({ keys = [] } = await res.json());
  } catch (err) {
    throw new AccessCheckError("keys", `couldn't load Access keys from ${issuer} (${err.message})`);
  }
  const map = new Map();
  for (const jwk of keys) {
    if (jwk.kty !== "RSA" || !jwk.kid) continue;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    map.set(jwk.kid, key);
  }
  const entry = { fetchedAt: Date.now(), keys: map };
  keyCache.set(issuer, entry);
  return entry;
}

async function keyFor(issuer, kid) {
  let entry = keyCache.get(issuer);
  if (!entry || Date.now() - entry.fetchedAt > KEYS_TTL_MS) entry = await loadKeys(issuer);
  // An unknown key id usually means Access just rotated its keys: fetch once more
  if (!entry.keys.has(kid)) entry = await loadKeys(issuer);
  return entry.keys.get(kid) ?? null;
}

/** For tests. */
export function clearKeyCache() {
  keyCache.clear();
}

/* ---------- The token ---------- */

/** Why a token was refused; `code` picks the advice shown (see adviceFor). */
export class AccessCheckError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}
const fail = (code, message, detail) => {
  throw new AccessCheckError(code, message, detail);
};

const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

/**
 * Checks an Access token and returns its claims, or throws saying why not.
 * @param {string} token
 * @param {{ teamDomain: string, aud: string, now?: number }} opts  now in ms
 */
export async function verifyAccessToken(token, { teamDomain, aud, now = Date.now() }) {
  const parts = String(token).split(".");
  if (parts.length !== 3) fail("malformed", "malformed token");
  const [h, p, s] = parts;

  let header, claims;
  try {
    header = b64urlJson(h);
    claims = b64urlJson(p);
  } catch {
    fail("malformed", "malformed token");
  }
  if (header.alg !== "RS256") fail("malformed", "unexpected algorithm");

  // Team and application first: refusing early is always safe, and a wrong
  // setting then gets named (with the token's value) instead of surfacing as
  // a failed key download. Nothing is trusted until the signature checks out.
  const issuer = issuerFor(teamDomain);
  if (claims.iss !== issuer) fail("team", "token is from another team", String(claims.iss));
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(aud)) fail("application", "token is for another application", audiences.join(", "));

  const key = await keyFor(issuer, header.kid);
  if (!key) fail("signature", "unknown signing key");
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(s), new TextEncoder().encode(h + "." + p));
  if (!ok) fail("signature", "bad signature");

  const nowS = Math.floor(now / 1000);
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < nowS) fail("expired", "token expired");
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_S > nowS) fail("expired", "token not valid yet");
  if (typeof claims.email !== "string" || !claims.email.includes("@")) fail("malformed", "token has no email");
  return claims;
}

/* ---------- Per request ---------- */

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function refuse(request, status, message) {
  const api = new URL(request.url).pathname.startsWith("/api/");
  const headers = { "Cache-Control": "no-store" };
  if (api) {
    return new Response(JSON.stringify({ error: message }), { status, headers: { ...headers, "Content-Type": "application/json" } });
  }
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bowling Ball Finder</title>
<body style="font-family:ui-monospace,monospace;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.3rem">Bowling Ball Finder</h1><p>${escapeHtml(message)}</p></body>`;
  return new Response(html, { status, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}

/**
 * What to tell the person (usually Alexander, setting up) when their token is
 * refused. Names the Worker setting to fix; never shows a setting's secret value.
 * The token's own team and application values are shown: they belong to the
 * person who just signed in, and only a token signed by the configured team
 * is ever accepted, so knowing them doesn't help anyone else in.
 */
export function adviceFor(err) {
  switch (err?.code) {
    case "team":
      return `The ACCESS_TEAM_DOMAIN setting doesn't match the Cloudflare Access team that signed you in. Set it to: ${String(err.detail).replace(/^https:\/\//, "")}`;
    case "application":
      return `The ACCESS_AUD setting doesn't match this Access application. Set it to the application's Application Audience (AUD) Tag: ${err.detail}`;
    case "keys":
      return "Couldn't load the Cloudflare Access signing keys. Check the ACCESS_TEAM_DOMAIN setting: it should look like yourteam.cloudflareaccess.com (Zero Trust > Settings).";
    case "expired":
      return "Your sign-in has expired. Sign out and sign in again.";
    default:
      return "Sign out and sign in again.";
  }
}

/**
 * Decides who is making this request.
 * @returns {Promise<{ ok: true, email: string } | { ok: false, response: Response }>}
 */
export async function authenticate(request, env) {
  // Local development: act as DEV_FAKE_USER, but only where Access isn't set up at all
  if (env.DEV_FAKE_USER && !env.ACCESS_AUD) {
    return { ok: true, email: String(env.DEV_FAKE_USER).trim().toLowerCase() };
  }

  const missing = missingSettings(env);
  if (missing.length) {
    return { ok: false, response: refuse(request, 503, `Not set up yet. Missing Worker settings: ${missing.join(", ")}. See docs/SETUP.md in the bowlingballfinder repo.`) };
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok: false, response: refuse(request, 403, "Please sign in through bowling.alexanderk.dev.") };

  let claims;
  try {
    claims = await verifyAccessToken(token, { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD.trim() });
  } catch (err) {
    console.warn("access token rejected:", err.code ?? "error", err.message);
    return { ok: false, response: refuse(request, 403, `Your sign-in couldn't be checked. ${adviceFor(err)}`) };
  }

  const email = claims.email.trim().toLowerCase();
  if (!allowedEmails(env).includes(email)) {
    return { ok: false, response: refuse(request, 403, `${email} isn't on this app's list of users.`) };
  }
  return { ok: true, email };
}
