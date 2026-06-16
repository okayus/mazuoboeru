// Pure creator-allowlist policy for the dogfooding phase.
//
// The production URL is open: the OAuth callback creates a user for ANY GitHub
// sign-in (no signup allowlist), and bots reach a *.workers.dev host within minutes
// of publication. While the app is effectively single-user (the owner dogfooding to
// refine UX), quiz creation + publishing can be restricted to a configured set of
// identities via the ALLOWED_CREATORS env (comma/space-separated emails).
//
// This is NOT the public-launch defense: when the service opens up, drop the
// allowlist and add a per-user write rate limit instead (the report route already
// shows the DB-count-over-a-rolling-window pattern). See docs/project-status.md.
//
// Key = the creator's email, matched case-insensitively. Email is the OAuth-verified
// identity (ADR-0001 only links/creates on a provider-asserted verified email), so it
// can't be spoofed by another GitHub account. An EMPTY/absent allowlist means the gate
// is OFF (open) — so deploying this never locks anyone out and local dev / e2e need no
// env; you opt into the restriction by setting ALLOWED_CREATORS. A non-empty allowlist
// fails CLOSED for a caller with no / unlisted email.

export function parseCreatorAllowlist(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set();
  const entries = raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return new Set(entries);
}

export function isCreatorAllowed(
  allowlist: ReadonlySet<string>,
  email: string | null | undefined,
): boolean {
  if (allowlist.size === 0) return true; // gate off (open)
  if (!email) return false; // gate on, caller has no email -> deny
  return allowlist.has(email.trim().toLowerCase());
}
