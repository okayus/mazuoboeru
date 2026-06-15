# e2e (Playwright)

Phase 1 vertical-slice e2e for `@mazuoboeru/web`. Three specs, the scope the e2e skill
(`cloudflare-workers-e2e-playwright`) prescribes — e2e covers **wiring**, units cover
semantics:

| spec | catches |
| --- | --- |
| `golden-path.spec.ts` | session-cookie wiring, route→handler→D1→SPA round-trip, page-reload persistence, **cross-account** publish→challenge→**server grading** |
| `authorization-boundary.spec.ts` | existence-hiding (a draft is 404, not 403, to non-authors and the public), 401 on author-only routes — i.e. Hono middleware mount order |
| `security-headers.spec.ts` | `app.use("*", securityHeaders)` riding every response (SPA shell, pure Worker route, API error) |

## Run it (on the HOST, not the sandbox)

```bash
pnpm --filter @mazuoboeru/web exec playwright install chromium   # one-time
pnpm e2e            # from repo root (or: pnpm --filter @mazuoboeru/web e2e)
```

The sandbox container **cannot** run the browser: its egress firewall has no route to
Playwright's Chromium CDN. Author/typecheck in the container; run the browser on the
host. (This also matches the skill's "don't run e2e in CI yet" stance — there is no
workflow on purpose.)

`pnpm e2e` is self-contained: its `webServer` runs `e2e:server`, which **builds**, then
**migrates + seeds** a dedicated local D1 (`node e2e/seed.ts`), copies `worker.e2e.vars`
over the built `.dev.vars`, and serves the **built Worker** via `wrangler dev`. No
`.dev.vars` of your own is required for e2e — the seam needs no OAuth secrets.

## Why we drive the build artifact (not `vite dev`)

Two traps the skill documents, both avoided by pointing `wrangler dev` at
`dist/mazuoboeru/wrangler.json` with `--persist-to .wrangler/state-e2e`:

1. **CSP × Vite HMR preamble** — Vite injects an inline `<script>` (React Fast Refresh)
   that a strict `script-src 'self'` CSP blocks, so React never mounts after a reload.
   The build emits external JS, so the real CSP is honored.
2. **D1 state path** — with `--config dist/...`, wrangler resolves the local sqlite
   relative to the config dir unless `--persist-to` pins it; `seed.ts` and `wrangler dev`
   share `.wrangler/state-e2e`, so the Worker reads the seeded rows.

## Why there is no test-login route (the seam)

Login is GitHub OAuth; the callback exchanges the code **server→github.com**, which
can't run headlessly. The skill's anti-pattern is bolting a `DEV_BYPASS`/test-login
route onto the Worker just to make e2e easy — that ships an auth backdoor and tests
nothing real.

Instead `seed.ts` inserts a **real `session` row** whose `id` is `sha256(token)` —
byte-for-byte what `worker/auth/session.ts` + `worker/lib/crypto.ts` store — and the
specs set that `token` as the `session` cookie. Production `getSessionUser` runs
unchanged; **no worker code is added or modified for e2e.** The fixtures (users, tokens,
the seeded draft) live in `fixtures.ts`, imported by both `seed.ts` and the specs.

## Scope honesty: the strict prod CSP is NOT asserted here

`worker/middleware/security.ts` emits the strict CSP (`script-src 'self'`, HSTS) only
for an **https** ORIGIN. e2e runs on `http://localhost` (so cookies aren't `Secure` and
the CSRF Origin matches), which yields the **dev** CSP. `security-headers.spec.ts`
therefore asserts the environment-independent directives (`default-src 'self'`,
`frame-ancestors 'none'`, `object-src 'none'`, `X-Frame-Options`, …). The strict prod
CSP is verified against production by curl — see `docs/project-status.md` → "現況の確かめ方".

## Gotcha baked in: bind 127.0.0.1, not localhost

`e2e:server` runs `wrangler dev … --ip 127.0.0.1`, and ORIGIN / baseURL are `127.0.0.1`
too. Routing the e2e Worker via `localhost` stalls on IPv4/IPv6 resolution in the
sandbox — the Worker is "Ready" but never returns a byte. `prepare-config.ts` also pins
`dev.ip` in the built config. If you ever see e2e requests hang at connect-but-no-response,
this is why; keep everything on `127.0.0.1`.

## Files

- `playwright.config.ts` (repo: `apps/web/`) — config + the "why not vite dev" rationale
- `fixtures.ts` — shared users/tokens/draft (imported by seed + specs)
- `seed.ts` — node24-native reset+seed; hardcodes `--local` (never touches prod D1)
- `prepare-config.ts` — post-build: pin e2e vars + `dev.ip` + strip the `unsafe` ratelimit
  binding (it would proxy to a remote resource and hang every request locally)
- `worker.e2e.vars` — ORIGIN/RP_ID for the e2e Worker (copied over `dist` `.dev.vars`)
- `specs/*.spec.ts` — the three specs
- `tsconfig.json` — `pnpm check:e2e`
