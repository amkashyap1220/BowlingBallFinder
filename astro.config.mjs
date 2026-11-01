// Builds the pages into dist/, which the Worker serves after checking who is
// signed in (see worker/index.js and wrangler.jsonc). Pages are .astro files
// in src/pages/; the interactive parts are Svelte components in
// src/components/, which Astro compiles into scripts for the pages that use them.
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

export default defineConfig({
  site: "https://bowling.alexanderk.dev",
  integrations: [svelte()],
  build: { format: "preserve" },
});
