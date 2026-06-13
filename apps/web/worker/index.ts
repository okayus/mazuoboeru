import { Hono } from "hono";
import { runScheduled } from "./cron";
import { optionalAuth, requireAuth } from "./auth/middleware";
import { authRouter } from "./auth/oauth";
import { destroySession } from "./auth/session";
import { csrf, securityHeaders } from "./middleware/security";
import { quizzesRouter } from "./routes/quizzes";
import { tokensRouter } from "./routes/tokens";
import type { User } from "./db/schema";
import type { Env } from "./types";

const app = new Hono<Env>();

// Global: security headers on every response, CSRF Origin check on mutations.
app.use("*", securityHeaders);
app.use("*", csrf);

app.get("/health", (c) => c.json({ status: "ok" }));

// Public projection of a user — never leak email or other PII.
function meJson(user: User) {
  return { id: user.id, displayName: user.displayName, role: user.role };
}

const api = new Hono<Env>();
api.use("*", optionalAuth);

// Current user, or { user: null } when not logged in.
api.get("/auth/me", (c) => {
  const user = c.get("user");
  return c.json({ user: user ? meJson(user) : null });
});

// Log out: destroy the session and clear the cookie.
api.post("/auth/logout", requireAuth, async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

// PAT management (session-only).
api.route("/tokens", tokensRouter);

// Quiz author CRUD + publish gate (session or PAT with quiz:write).
api.route("/quizzes", quizzesRouter);

app.route("/api", api);

// OAuth login + callback. Mounted at /auth so the registered redirect URI is
// <ORIGIN>/auth/callback/{google,github} (ADR-0001).
app.route("/auth", authRouter);

// L3 of the 3-layer SPA routing dance: delegate unmatched routes to the Assets binding.
app.notFound(async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(res.body, res);
});

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(event, env));
  },
} satisfies ExportedHandler<Env["Bindings"]>;
