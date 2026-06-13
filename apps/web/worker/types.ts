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
  // Add more bindings (KV, etc.) as needed. Every other worker file imports from here — don't re-declare the type.
};

export type AuthMethod = "session" | "pat";

// Hono context variables. `user` is set by the auth middleware when a request is
// authenticated; read it via requireUser(c) after requireAuth, never assume it.
export type Variables = {
  user?: User;
  authMethod?: AuthMethod;
};

// The shape every Hono instance/handler in this worker is typed against.
export type Env = { Bindings: Bindings; Variables: Variables };
