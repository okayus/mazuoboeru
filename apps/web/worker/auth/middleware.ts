import type { Context, MiddlewareHandler } from "hono";
import type { User } from "../db/schema";
import type { AuthMethod, Env } from "../types";
import { isCreatorAllowed, parseCreatorAllowlist } from "../domain/creator-allowlist";
import { apiError } from "../http/errors";
import { validatePat } from "./pat";
import type { Scope } from "./scopes";
import { getSessionUser } from "./session";

type Resolved = { user: User; method: AuthMethod; scopes: Scope[] };

// Resolve the user for a request. A Bearer PAT takes precedence over the session
// cookie; returns null if unauthenticated. Sessions get full access (scopes = []
// means "not scope-limited"); PATs carry their granted scopes.
async function authenticate(c: Context<Env>): Promise<Resolved | null> {
  const pat = await validatePat(c.env, c.req.header("Authorization"));
  if (pat) return { user: pat.user, method: "pat", scopes: pat.scopes };
  const sessionUser = await getSessionUser(c);
  if (sessionUser) return { user: sessionUser, method: "session", scopes: [] };
  return null;
}

function apply(c: Context<Env>, auth: Resolved): void {
  c.set("user", auth.user);
  c.set("authMethod", auth.method);
  c.set("scopes", auth.scopes);
}

// Populate c.user when authenticated, but never reject. For public routes that
// behave differently when logged in (e.g. the timeline).
export const optionalAuth: MiddlewareHandler<Env> = async (c, next) => {
  const auth = await authenticate(c);
  if (auth) apply(c, auth);
  await next();
};

// Reject with 401 unless authenticated (session or PAT). Safe to stack after
// optionalAuth (reuses the resolved user) or to use standalone.
export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  let user = c.get("user");
  if (!user) {
    const auth = await authenticate(c);
    if (auth) {
      apply(c, auth);
      user = auth.user;
    }
  }
  if (!user) return c.json(apiError("unauthorized"), 401);
  await next();
};

// Require a *cookie session* specifically — not a PAT. Used for sensitive account
// operations like minting/revoking PATs (a PAT must not be able to mint more PATs).
export const requireSession: MiddlewareHandler<Env> = async (c, next) => {
  let user = c.get("user");
  if (!user) {
    const auth = await authenticate(c);
    if (auth) {
      apply(c, auth);
      user = auth.user;
    }
  }
  if (!user) return c.json(apiError("unauthorized"), 401);
  if (c.get("authMethod") !== "session") {
    return c.json(apiError("session_required"), 403);
  }
  await next();
};

// Require a PAT scope. Sessions (scopes resolved as full access) always pass.
export function requireScope(scope: Scope): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (c.get("authMethod") === "pat") {
      const scopes = c.get("scopes") ?? [];
      if (!scopes.includes(scope)) {
        return c.json(apiError("insufficient_scope", { scope }), 403);
      }
    }
    await next();
  };
}

// Dogfooding gate: restrict quiz creation/publishing to ALLOWED_CREATORS (emails).
// Empty/absent env => open (no-op), so it's safe to leave wired in permanently; flip
// it on by setting the secret. Stacks AFTER requireAuth. This is the temporary single-
// user gate, not the public-launch per-user write rate limit (docs/project-status.md).
export const requireCreator: MiddlewareHandler<Env> = async (c, next) => {
  const allowlist = parseCreatorAllowlist(c.env.ALLOWED_CREATORS);
  if (allowlist.size > 0 && !isCreatorAllowed(allowlist, requireUser(c).email)) {
    return c.json(apiError("not_allowed_creator"), 403);
  }
  await next();
};

// Read the authenticated user after requireAuth. Throws if misused (no auth ran).
export function requireUser(c: Context<Env>): User {
  const user = c.get("user");
  if (!user) throw new Error("requireUser called without requireAuth");
  return user;
}
