import { Hono } from "hono";
import { runScheduled } from "./cron";
import { optionalAuth, requireAuth } from "./auth/middleware";
import { authRouter } from "./auth/oauth";
import { destroySession } from "./auth/session";
import { csrf, securityHeaders } from "./middleware/security";
import { attemptsRouter } from "./routes/attempts";
import { dashboardRouter } from "./routes/dashboard";
import { publicRouter } from "./routes/public";
import { quizzesRouter } from "./routes/quizzes";
import { reportsRouter } from "./routes/reports";
import { reviewListRouter } from "./routes/review-list";
import { tokensRouter } from "./routes/tokens";
import type { User } from "./db/schema";
import type { Env } from "./types";

// Public projection of a user — never leak email or other PII.
function meJson(user: User): { id: string; displayName: string; role: User["role"] } {
  return { id: user.id, displayName: user.displayName, role: user.role };
}

// Routers are method-chained (not separate statements) so their route types
// accumulate into the value's type — required for hc<AppType> inference (ADR-0011).
const api = new Hono<Env>()
  .use("*", optionalAuth)
  // Current user, or { user: null } when not logged in.
  .get("/auth/me", (c) => {
    const user = c.get("user");
    return c.json({ user: user ? meJson(user) : null });
  })
  // Log out: destroy the session and clear the cookie.
  .post("/auth/logout", requireAuth, async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  })
  // PAT management (session-only).
  .route("/tokens", tokensRouter)
  // Quiz author CRUD + publish gate (session or PAT with quiz:write).
  .route("/quizzes", quizzesRouter)
  // Public read surface: timeline + single published quiz (challenge view).
  .route("/public", publicRouter)
  // Attempts: start/resume, submit one answer (server-graded), get state.
  .route("/attempts", attemptsRouter)
  // Moderation report channel (session-only, per-user rate limited).
  .route("/reports", reportsRouter)
  // Private learning dashboard (session-only): accuracy / streak / per-tag (ADR-0006).
  .route("/dashboard", dashboardRouter)
  // Review List / "my hot list" (session-only, private; question-level — ADR-0008).
  .route("/review-list", reviewListRouter);

const app = new Hono<Env>()
  // Global: security headers on every response, CSRF Origin check on mutations.
  .use("*", securityHeaders)
  .use("*", csrf)
  .get("/health", (c) => c.json({ status: "ok" }))
  .route("/api", api)
  // OAuth login + callback. Mounted at /auth so the registered redirect URI is
  // <ORIGIN>/auth/callback/{google,github} (ADR-0001).
  .route("/auth", authRouter);

// The full route tree's type, consumed by the typed client (hc<AppType>) in
// src/api.ts so response DTOs are inferred from these handlers (ADR-0011). Type only
// — erased at build, so no server code reaches the client bundle.
export type AppType = typeof app;

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
