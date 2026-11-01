/* ==========================================================================
   The Bowling Ball Finder Worker (bowling.alexanderk.dev).

   Every request comes here first (run_worker_first in wrangler.jsonc):
     1. access.js checks who is signed in, or refuses
     2. /api/...  -> api.js
        anything else -> the built pages and files in dist/
   ========================================================================== */

import { authenticate } from "./access.js";
import { handleApi } from "./api.js";

export default {
  async fetch(request, env) {
    const auth = await authenticate(request, env);
    if (!auth.ok) return auth.response;

    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return handleApi(request, env, auth.email);
    return env.ASSETS.fetch(request);
  },
};
