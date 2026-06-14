import type { MiddlewareHandler } from "hono";
import type { Env } from "../types";

// Per-IP rate limit for the unauthenticated OAuth routes (begin + callback) —
// the only pre-auth surface that does real work: the callback makes outbound
// subrequests to GitHub and can create accounts. Bot scans reach a *.workers.dev
// host within minutes of HTTPS publication (CT logs), so this caps the drain.
// Authenticated and "post" routes are already gated by the auth middleware and
// are deliberately NOT rate-limited here (skill: cloudflare-workers-bot-scan-defense;
// docs/security.md).
//
// Keyed on CF-Connecting-IP. Fails OPEN: if the binding is absent (local dev, or
// not yet provisioned) the request proceeds — a limiter hiccup must never lock a
// real user out of logging in.
export const authRateLimit: MiddlewareHandler<Env> = async (c, next) => {
  const limiter = c.env.AUTH_RATE_LIMITER;
  if (limiter) {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const { success } = await limiter.limit({ key: ip });
    if (!success) {
      return c.json({ error: "rate_limited" }, 429);
    }
  }
  await next();
};
