import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { apiToken, user, type User } from "../db/schema";
import { randomToken, sha256Hex } from "../lib/crypto";
import { newId } from "../lib/id";
import { parseStringArray } from "../lib/json";
import { isScope, SCOPES, type Scope } from "./scopes";
import type { Bindings } from "../types";

// `mzo_pat_` prefix makes PATs detectable by secret scanners (GitHub push
// protection) and identifiable in logs (ADR-0001 / data-model.md).
const PAT_PREFIX = "mzo_pat_";
const LAST_USED_THROTTLE_MS = 60 * 60 * 1000; // update last_used_at at most hourly

function generatePat(): string {
  return PAT_PREFIX + randomToken(32);
}

// token_hash = sha256(token + pepper). The pepper is a Worker Secret, never stored
// with the hash, so a DB leak alone can't be brute-forced into live tokens.
function hashPat(env: Bindings, token: string): Promise<string> {
  return sha256Hex(token + (env.PAT_PEPPER ?? ""));
}

export type CreatedToken = {
  id: string;
  name: string;
  token: string; // raw — shown exactly once
  scopes: Scope[];
  createdAt: number;
};

export async function createToken(
  env: Bindings,
  userId: string,
  name: string,
): Promise<CreatedToken> {
  const token = generatePat();
  const tokenHash = await hashPat(env, token);
  const id = newId();
  const now = Date.now();
  const scopes: Scope[] = [...SCOPES];
  await db(env).insert(apiToken).values({
    id,
    userId,
    name,
    tokenHash,
    scopes: JSON.stringify(scopes),
    createdAt: now,
  });
  return { id, name, token, scopes, createdAt: now };
}

export type TokenSummary = {
  id: string;
  name: string;
  scopes: Scope[];
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
};

export async function listTokens(
  env: Bindings,
  userId: string,
): Promise<TokenSummary[]> {
  const rows = await db(env)
    .select({
      id: apiToken.id,
      name: apiToken.name,
      scopes: apiToken.scopes,
      createdAt: apiToken.createdAt,
      lastUsedAt: apiToken.lastUsedAt,
      expiresAt: apiToken.expiresAt,
      revokedAt: apiToken.revokedAt,
    })
    .from(apiToken)
    .where(eq(apiToken.userId, userId))
    .orderBy(desc(apiToken.createdAt));
  return rows.map((r) => ({ ...r, scopes: parseScopes(r.scopes) }));
}

// Revoke a token the caller owns. Returns false if it isn't theirs / doesn't exist.
export async function revokeToken(
  env: Bindings,
  userId: string,
  id: string,
): Promise<boolean> {
  const owned = await db(env)
    .select({ id: apiToken.id })
    .from(apiToken)
    .where(and(eq(apiToken.id, id), eq(apiToken.userId, userId)))
    .limit(1);
  if (!owned[0]) return false;
  await db(env)
    .update(apiToken)
    .set({ revokedAt: Date.now() })
    .where(eq(apiToken.id, id));
  return true;
}

export type PatPrincipal = { user: User; scopes: Scope[] };

// Validate a Bearer PAT. Returns the principal (user + scopes) or null. Touches
// last_used_at at most hourly. Used by the auth middleware ahead of the session.
export async function validatePat(
  env: Bindings,
  authorization: string | undefined,
): Promise<PatPrincipal | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token.startsWith(PAT_PREFIX)) return null;

  const tokenHash = await hashPat(env, token);
  const rows = await db(env)
    .select({ user, token: apiToken })
    .from(apiToken)
    .innerJoin(user, eq(apiToken.userId, user.id))
    .where(eq(apiToken.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const t = row.token;
  const now = Date.now();
  if (t.revokedAt !== null) return null;
  if (t.expiresAt !== null && t.expiresAt < now) return null;

  if (t.lastUsedAt === null || now - t.lastUsedAt > LAST_USED_THROTTLE_MS) {
    await db(env)
      .update(apiToken)
      .set({ lastUsedAt: now })
      .where(eq(apiToken.id, t.id));
  }
  return { user: row.user, scopes: parseScopes(t.scopes) };
}

// Stored scopes → typed Scope[]; any unknown/legacy scope string is dropped.
function parseScopes(json: string): Scope[] {
  return parseStringArray(json).filter(isScope);
}
