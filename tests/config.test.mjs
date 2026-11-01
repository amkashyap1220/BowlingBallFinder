// The Cloudflare settings that keep the app private (wrangler.jsonc), read the
// way wrangler itself reads them. If one of these fails, the change would put
// the app or its data somewhere Cloudflare Access doesn't guard.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { unstable_readConfig } = createRequire(import.meta.url)("wrangler");
const config = unstable_readConfig({ config: "wrangler.jsonc" });

test("every request goes through the Worker's sign-in check first", () => {
  assert.equal(config.assets.run_worker_first, true);
});

test("the app's only address is bowling.alexanderk.dev", () => {
  assert.deepEqual(config.routes, [{ pattern: "bowling.alexanderk.dev", custom_domain: true }]);
  assert.equal(config.workers_dev, false, "workers.dev address would skip Access");
  assert.equal(config.preview_urls, false, "version preview addresses would skip Access");
});

test("branch previews get no database, storage or secrets", () => {
  // Previews live outside Access. With nothing bound they can only say "Not set up yet".
  assert.deepEqual(config.previews, {}, "the previews block must stay empty");
});
