import { defineConfig } from "vitest/config";

// Pure-function unit tests only (domain logic). No Cloudflare runtime — those are
// covered by Playwright e2e (cloudflare-workers-e2e-playwright) in a later phase.
export default defineConfig({
  test: {
    include: ["worker/**/*.test.ts"],
    environment: "node",
  },
});
