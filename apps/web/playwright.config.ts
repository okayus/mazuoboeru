import { defineConfig, devices } from "@playwright/test";

// The e2e Worker + browser origin. Dedicated port (5173/5273/5373 belong to dev
// servers). We use 127.0.0.1, NOT localhost, and ORIGIN in e2e/worker.e2e.vars MUST
// match it (CSRF Origin check). wrangler dev binds `--ip 127.0.0.1` (see e2e:server)
// because routing via "localhost" stalls on IPv4/IPv6 resolution in the sandbox and
// the Worker never responds — using 127.0.0.1 end-to-end sidesteps it.
const HOST = "127.0.0.1";
const PORT = 5399;
const baseURL = `http://${HOST}:${PORT}`;

// WHY WE DO NOT TARGET `vite dev` (do not "simplify" this back):
// Playwright drives the BUILT artifact via `wrangler dev`, not the Vite dev server,
// for two reasons the e2e skill (cloudflare-workers-e2e-playwright) documents:
//   1. CSP vs Vite HMR preamble — Vite injects an inline <script> for React Fast
//      Refresh that a strict `script-src 'self'` CSP blocks, so React never mounts
//      after a reload. The build emits external JS, so the real CSP is honored.
//   2. D1 state path — `wrangler dev --config dist/.../wrangler.json` resolves the
//      local sqlite relative to the CONFIG dir unless `--persist-to` pins it. The
//      e2e:server script passes `--persist-to .wrangler/state-e2e`, the same dir
//      seed.ts migrates + seeds, so the Worker reads the seeded rows (not an empty db).
// See e2e/README.md and apps/web/package.json (e2e:server) for the full chain.
//
// CI: we intentionally do NOT run e2e in CI yet (the skill's guidance for a small
// project — run locally before merge). There is no GitHub workflow for this on
// purpose; revisit if a regression reaches prod despite local e2e passing.
export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: false,
  workers: 1, // one Worker + one local D1; serial keeps the small suite deterministic
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    // build → seed local e2e D1 → pin e2e vars → serve the built Worker. See package.json.
    command: "pnpm run e2e:server",
    url: `${baseURL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000, // cold build + migrate + seed + wrangler boot
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
