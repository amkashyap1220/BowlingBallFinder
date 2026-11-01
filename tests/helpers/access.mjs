// Fake Cloudflare Access for tests: a signing key, a stubbed certs endpoint,
// and tokens shaped like the real ones.
import { clearKeyCache } from "../../worker/access.js";

export const TEAM = "testteam.cloudflareaccess.com";
export const AUD = "test-aud-tag";
export const ISSUER = "https://" + TEAM;

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");

export async function makeSigner(kid = "key-1") {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid, alg: "RS256", use: "sig" };
  async function sign(claims, header = {}) {
    const h = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT", ...header }));
    const p = b64url(JSON.stringify(claims));
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(h + "." + p));
    return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
  }
  return { jwk, sign };
}

// Serve these keys at the team's certs address; counts how often it's asked
export function stubCerts(jwks) {
  clearKeyCache();
  const original = globalThis.fetch;
  const calls = { count: 0 };
  globalThis.fetch = async (url) => {
    if (String(url) === ISSUER + "/cdn-cgi/access/certs") {
      calls.count++;
      return new Response(JSON.stringify({ keys: jwks }), { headers: { "Content-Type": "application/json" } });
    }
    throw new Error("unexpected fetch: " + url);
  };
  calls.restore = () => {
    globalThis.fetch = original;
    clearKeyCache();
  };
  return calls;
}

export function claimsFor(email, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { aud: [AUD], email, iss: ISSUER, iat: now, nbf: now, exp: now + 3600, sub: "user-id", type: "app", ...overrides };
}

export const settings = (extra = {}) => ({
  ACCESS_TEAM_DOMAIN: TEAM,
  ACCESS_AUD: AUD,
  ALLOWED_EMAILS: "alex@example.com, Friend@Example.com",
  ...extra,
});
