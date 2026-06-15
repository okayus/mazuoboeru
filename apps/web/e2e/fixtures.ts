// Shared e2e fixtures. Imported by both the seed script (seed.ts — node24 native TS,
// with the explicit ".ts" extension node requires) and the specs (extensionless, since
// Playwright's loader resolves it). Keep this file pure data so node's type-stripping
// runs it without a build step.

export type Fixture = { id: string; displayName: string; email: string; token: string };

// The raw session tokens live ONLY here and in the cookie the specs set. The DB stores
// sha256(token) as session.id — seed.ts computes that hash exactly as
// worker/auth/session.ts / worker/lib/crypto.ts do. So this is a REAL session row,
// exercised through the production getSessionUser path; it is NOT an auth bypass
// (there is deliberately no test-login route in the worker — see e2e/README.md).
export const AUTHOR: Fixture = {
  id: "e2e-user-author",
  displayName: "E2E Author",
  email: "e2e-author@example.test",
  token: "e2e-session-author-2f8b1c6a4d9e7035",
};

export const CHALLENGER: Fixture = {
  id: "e2e-user-challenger",
  displayName: "E2E Challenger",
  email: "e2e-challenger@example.test",
  token: "e2e-session-challenger-5a3d9f1e8c2b6047",
};

// A draft owned by AUTHOR, seeded so the authorization-boundary spec can assert it is
// invisible (404, not 403 — existence-hiding) to CHALLENGER and to the public.
export const DRAFT_QUIZ = {
  id: "e2e-draft-quiz",
  title: "E2E 下書き（作者だけが見える）",
  questionId: "e2e-draft-q1",
  choiceCorrectId: "e2e-draft-c1",
  choiceWrongId: "e2e-draft-c2",
};
