import { expect, test } from "@playwright/test";
import { AUTHOR, CHALLENGER, DRAFT_QUIZ } from "../fixtures";

// The seeded draft (owned by AUTHOR) must be invisible to everyone else. We assert at
// the API layer because that is where the boundary lives — a regression here is a
// Hono middleware mount-order / existence-hiding bug, not a UI bug. GETs are exempt
// from the CSRF Origin check, so an explicit Cookie header is enough.
const cookie = (token: string) => ({ Cookie: `session=${token}` });

test("a draft is 404 (existence-hidden) to non-authors and to the public", async ({ request }) => {
  // The author CAN read their own draft (positive control).
  const own = await request.get(`/api/quizzes/${DRAFT_QUIZ.id}`, { headers: cookie(AUTHOR.token) });
  expect(own.status()).toBe(200);

  // A different logged-in user gets 404 — NOT 403 — so existence is not revealed.
  const other = await request.get(`/api/quizzes/${DRAFT_QUIZ.id}`, {
    headers: cookie(CHALLENGER.token),
  });
  expect(other.status()).toBe(404);

  // The public challenge endpoint also 404s an unpublished quiz.
  const pub = await request.get(`/api/public/quizzes/${DRAFT_QUIZ.id}`);
  expect(pub.status()).toBe(404);
});

test("author-only routes reject the unauthenticated with 401", async ({ request }) => {
  const mine = await request.get("/api/quizzes/mine");
  expect(mine.status()).toBe(401);
});
