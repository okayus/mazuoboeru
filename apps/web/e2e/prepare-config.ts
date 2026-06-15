#!/usr/bin/env node
// Post-build, pre-`wrangler dev` step for the e2e worker. Two edits to the built
// dist/mazuoboeru/ output (regenerated every build, gitignored):
//
//   1. Pin e2e worker vars. The Cloudflare vite plugin copies the developer's real
//      .dev.vars into dist, which would set ORIGIN to the dev port and 403 every e2e
//      mutation (CSRF Origin check). We overwrite it with e2e/worker.e2e.vars.
//
//   2. Strip the `unsafe` ratelimit binding. wrangler dev cannot simulate an `unsafe`
//      ratelimit binding locally — it proxies to a REMOTE Cloudflare resource
//      ("connected to remote resource"), whose auth/egress handshake hangs every
//      request in a credential-less sandbox (and on a logged-out host). The limiter is
//      fail-open and out of e2e scope (we don't test rate limiting), so removing it
//      from the e2e worker is correct and keeps the whole run credential-free.
//
//   3. Pin dev.ip to 127.0.0.1. The built config carries `dev.ip: "localhost"`; routing
//      via "localhost" stalls on IPv4/IPv6 resolution in the sandbox (the Worker never
//      responds). The e2e:server command also passes `--ip 127.0.0.1`; this just keeps
//      the config self-consistent if wrangler dev is ever run without the flag.
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const CONFIG = "dist/mazuoboeru/wrangler.json";

copyFileSync("e2e/worker.e2e.vars", "dist/mazuoboeru/.dev.vars");

const cfg = JSON.parse(readFileSync(CONFIG, "utf8")) as Record<string, unknown>;
delete cfg.unsafe;
const dev = (cfg.dev as Record<string, unknown> | undefined) ?? {};
cfg.dev = { ...dev, ip: "127.0.0.1" };
writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));

console.error("e2e: pinned worker.e2e.vars + dev.ip=127.0.0.1 + stripped unsafe binding");
