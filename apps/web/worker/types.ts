import type { Scope } from "./auth/scopes";
import type { User } from "./db/schema";

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  RP_ID: string;
  ORIGIN: string;
  // Secrets (wrangler secret put in prod; .dev.vars in dev). Referenced by name only.
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  PAT_PEPPER?: string;
  // Dogfooding creator gate: comma/space-separated emails allowed to create/publish
  // quizzes. Empty/absent => gate OFF (open). Worker Secret in prod; .dev.vars locally.
  // Temporary single-user gate, NOT the public-launch per-user write rate limit
  // (docs/project-status.md). Consumed by requireCreator via domain/creator-allowlist.
  ALLOWED_CREATORS?: string;
  // Daily Digest push to kokemusu (ADR-0017): the receiving diary's base URL and a
  // kokemusu PAT for it. In prod the URL is a committed `vars` entry (not a secret —
  // it is the author's own public hostname) and only the PAT is a Worker Secret
  // (name reference only — ADR-0003); both come from .dev.vars locally. Either one
  // absent (local dev, preview) => the push is skipped entirely.
  KOKEMUSU_URL?: string;
  KOKEMUSU_PAT?: string;
  // Per-IP rate limiter for the unauthenticated OAuth routes. Provisioned as an
  // `unsafe` ratelimit binding in wrangler.jsonc (wrangler 3.x has no top-level
  // `ratelimits` key). `RateLimit` is a global @cloudflare/workers-types type.
  // Optional: absent in local dev, so the middleware fails open.
  AUTH_RATE_LIMITER?: RateLimit;
  // Add more bindings (KV, etc.) as needed. Every other worker file imports from here — don't re-declare the type.
};

export type AuthMethod = "session" | "pat";

// Hono context variables. `user` is set by the auth middleware when a request is
// authenticated; read it via requireUser(c) after requireAuth, never assume it.
// `scopes` is populated for PAT-authenticated requests (sessions have full access).
export type Variables = {
  user?: User;
  authMethod?: AuthMethod;
  scopes?: Scope[];
};

// The shape every Hono instance/handler in this worker is typed against.
export type Env = { Bindings: Bindings; Variables: Variables };
