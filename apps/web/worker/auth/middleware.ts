import type { Context, MiddlewareHandler } from "hono";
import type { User } from "../db/schema";
import type { AuthMethod, Env } from "../types";
import { getSessionUser } from "./session";

// Resolve the user for a request. A Bearer PAT takes precedence over the session
// cookie (the PAT branch is added in the PAT task); returns null if unauthenticated.
async function authenticate(
  c: Context<Env>,
): Promise<{ user: User; method: AuthMethod } | null> {
  const user = await getSessionUser(c);
  if (user) return { user, method: "session" };
  return null;
}

// Populate c.user when authenticated, but never reject. For public routes that
// behave differently when logged in (e.g. the timeline).
export const optionalAuth: MiddlewareHandler<Env> = async (c, next) => {
  const auth = await authenticate(c);
  if (auth) {
    c.set("user", auth.user);
    c.set("authMethod", auth.method);
  }
  await next();
};

// Reject with 401 unless authenticated. Safe to stack after optionalAuth (it
// reuses the already-resolved user) or to use standalone.
export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  let user = c.get("user");
  if (!user) {
    const auth = await authenticate(c);
    if (auth) {
      c.set("user", auth.user);
      c.set("authMethod", auth.method);
      user = auth.user;
    }
  }
  if (!user) return c.json({ error: "unauthorized" }, 401);
  await next();
};

// Read the authenticated user after requireAuth. Throws if misused (no auth ran).
export function requireUser(c: Context<Env>): User {
  const user = c.get("user");
  if (!user) throw new Error("requireUser called without requireAuth");
  return user;
}
