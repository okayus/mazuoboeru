import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { session, user, type User } from "../db/schema";
import { randomToken, sha256Hex } from "../lib/crypto";
import type { Env } from "../types";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (sliding)
const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;
const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000; // slide at most once/day

// host-only cookie. In prod (https) we use the __Host- prefix, which the browser
// enforces as Secure + Path=/ + no Domain — see ADR-0001. localhost dev is http,
// where __Host-/Secure can't be set, so we fall back to a plain name.
function isHttps(c: Context<Env>): boolean {
  return c.env.ORIGIN.startsWith("https://");
}
function cookieName(c: Context<Env>): string {
  return isHttps(c) ? "__Host-session" : "session";
}

function writeCookie(c: Context<Env>, token: string): void {
  setCookie(c, cookieName(c), token, {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

// Create a fresh session for a user and set the cookie. The raw token lives only
// in the cookie; the DB stores sha256(token) as the primary key.
export async function createSession(c: Context<Env>, userId: string): Promise<void> {
  const token = randomToken(32);
  const id = await sha256Hex(token);
  const now = Date.now();
  await db(c.env).insert(session).values({
    id,
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });
  writeCookie(c, token);
}

// Resolve the authenticated user from the session cookie, or null. Slides the
// 30-day expiry forward (throttled to ~once/day of DB writes) on active sessions,
// and garbage-collects an expired session row when it's encountered.
export async function getSessionUser(c: Context<Env>): Promise<User | null> {
  const token = getCookie(c, cookieName(c));
  if (!token) return null;
  const id = await sha256Hex(token);

  const rows = await db(c.env)
    .select({ user, expiresAt: session.expiresAt, lastSeenAt: session.lastSeenAt })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .where(eq(session.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const now = Date.now();
  if (row.expiresAt < now) {
    await db(c.env).delete(session).where(eq(session.id, id));
    deleteCookie(c, cookieName(c), { path: "/" });
    return null;
  }

  if (now - row.lastSeenAt > SESSION_REFRESH_MS) {
    await db(c.env)
      .update(session)
      .set({ lastSeenAt: now, expiresAt: now + SESSION_TTL_MS })
      .where(eq(session.id, id));
    writeCookie(c, token); // refresh cookie Max-Age to match
  }

  return row.user;
}

// Log out: delete the session row and clear the cookie.
export async function destroySession(c: Context<Env>): Promise<void> {
  const token = getCookie(c, cookieName(c));
  if (token) {
    const id = await sha256Hex(token);
    await db(c.env).delete(session).where(eq(session.id, id));
  }
  deleteCookie(c, cookieName(c), { path: "/" });
}
