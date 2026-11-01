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

/** "Alexanderk.cloudflareaccess.com/" or "https://..." -> "https://alexanderk.cloudflareaccess.com" */
export function issuerFor(teamDomain) {
  const host = String(teamDomain).trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
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
  const res = await fetch(issuer + "/cdn-cgi/access/certs");
  if (!res.ok) throw new Error(`Couldn't load Access keys (${res.status})`);
  const { keys = [] } = await res.json();
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

const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

/**
 * Checks an Access token and returns its claims, or throws saying why not.
 * @param {string} token
 * @param {{ teamDomain: string, aud: string, now?: number }} opts  now in ms
 */
export async function verifyAccessToken(token, { teamDomain, aud, now = Date.now() }) {
  const parts = String(token).split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [h, p, s] = parts;

  let header, claims;
  try {
    header = b64urlJson(h);
    claims = b64urlJson(p);
  } catch {
    throw new Error("malformed token");
  }
  if (header.alg !== "RS256") throw new Error("unexpected algorithm");

  const issuer = issuerFor(teamDomain);
  const key = await keyFor(issuer, header.kid);
  if (!key) throw new Error("unknown signing key");
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(s), new TextEncoder().encode(h + "." + p));
  if (!ok) throw new Error("bad signature");

  const nowS = Math.floor(now / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(aud)) throw new Error("token is for another application");
  if (claims.iss !== issuer) throw new Error("token is from another team");
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < nowS) throw new Error("token expired");
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_S > nowS) throw new Error("token not valid yet");
  if (typeof claims.email !== "string" || !claims.email.includes("@")) throw new Error("token has no email");
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
    console.warn("access token rejected:", err.message);
    return { ok: false, response: refuse(request, 403, "Your sign-in couldn't be checked. Sign out and sign in again.") };
  }

  const email = claims.email.trim().toLowerCase();
  if (!allowedEmails(env).includes(email)) {
    return { ok: false, response: refuse(request, 403, `${email} isn't on this app's list of users.`) };
  }
  return { ok: true, email };
}
