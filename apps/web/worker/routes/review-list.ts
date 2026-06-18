import { Hono } from "hono";
import { requireAuth, requireUser } from "../auth/middleware";
import {
  addToReviewList,
  listReviewListItems,
  publishedQuestionExists,
  removeFromReviewList,
} from "../db/review-list-queries";
import { apiError } from "../http/errors";
import type { Env } from "../types";

// Review List ("my hot list") — session-only, private. Question-level (CONTEXT.md
// Review List; replaces the quiz-level favorite, ADR-0008). Method-chained so the
// route types accumulate for hc<AppType> inference (ADR-0011).
export const reviewListRouter = new Hono<Env>()
  .use("*", requireAuth)

  // The user's Review List as displayable items (currently-published only), newest first.
  .get("/", async (c) => {
    const user = requireUser(c);
    const items = await listReviewListItems(c.env, user.id);
    return c.json({ items });
  })

  // Add a question to the Review List (idempotent). 404 if the question isn't part of a
  // currently published, non-deleted quiz.
  .post("/:questionId", async (c) => {
    const user = requireUser(c);
    const questionId = c.req.param("questionId");
    if (!(await publishedQuestionExists(c.env, questionId)))
      return c.json(apiError("not_found"), 404);
    await addToReviewList(c.env, user.id, questionId);
    return c.json({ ok: true, inReviewList: true });
  })

  .delete("/:questionId", async (c) => {
    const user = requireUser(c);
    await removeFromReviewList(c.env, user.id, c.req.param("questionId"));
    return c.json({ ok: true, inReviewList: false });
  });
