// PAT scope vocabulary — the single source of truth. A const tuple (not a bare
// string[]) so the `Scope` union is derived from it: requireScope() args and token
// grants are checked at compile time, and a typo like "quiz:wrte" fails to compile
// instead of silently denying a valid PAT. Mirrors the domain/report.ts pattern.
// Sessions are NOT scope-limited (scopes = [] means full access — see middleware).
export const SCOPES = ["quiz:read", "quiz:write"] as const;
export type Scope = (typeof SCOPES)[number];

export function isScope(s: string): s is Scope {
  return (SCOPES as readonly string[]).includes(s);
}
