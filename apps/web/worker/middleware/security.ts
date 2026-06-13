import type { MiddlewareHandler } from "hono";
import type { Env } from "../types";

// CSRF defense layer 2 (SameSite=Lax is layer 1): on state-changing methods,
// require the Origin header to equal our ORIGIN. Bearer (PAT) requests are exempt
// — they carry no ambient cookie credential, so a cross-site page can't forge them
// (it can't attach the victim's Authorization header). See docs/security.md.
export const csrf: MiddlewareHandler<Env> = async (c, next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const authz = c.req.header("Authorization");
    const isBearer = authz?.startsWith("Bearer ") ?? false;
    if (!isBearer) {
      const origin = c.req.header("Origin");
      if (!origin || origin !== c.env.ORIGIN) {
        return c.json({ error: "csrf_origin_mismatch" }, 403);
      }
    }
  }
  await next();
};

// Security headers on every response. CSP is strict in prod (no inline script —
// the Vite build emits external JS, so React still mounts) but relaxed in dev so
// Vite's HMR inline preamble + websocket work (the strict-CSP-breaks-reload trap
// from the e2e skill). Images are 'self' only for MVP (ADR-0004).
export const securityHeaders: MiddlewareHandler<Env> = async (c, next) => {
  await next();
  const https = c.env.ORIGIN.startsWith("https://");
  const csp = https
    ? [
        "default-src 'self'",
        "base-uri 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self'",
        "font-src 'self'",
        "connect-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
      ].join("; ")
    : [
        "default-src 'self'",
        "base-uri 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self' ws: http://localhost:*",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
      ].join("; ");

  c.header("Content-Security-Policy", csp);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
  if (https) {
    c.header("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
};
