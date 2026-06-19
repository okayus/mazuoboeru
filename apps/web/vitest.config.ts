import { defineConfig } from "vitest/config";

// Pure-function unit tests only — worker domain logic + client-side pure utils
// (e.g. src/lib). No Cloudflare runtime and no DOM; component behavior is covered by
// Playwright e2e (cloudflare-workers-e2e-playwright).
export default defineConfig({
  test: {
    include: ["worker/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },
});
