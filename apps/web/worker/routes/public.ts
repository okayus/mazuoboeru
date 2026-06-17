import { Hono } from "hono";
import { listPublishedQuizzes, loadPublishedQuiz } from "../db/public-queries";
import { listQuizTags } from "../db/tag-queries";
import { normalizeTag } from "../domain/tag";
import { publicQuizJson } from "../presenters/quiz";
import type { Env } from "../types";

// Public read surface — no auth required (optionalAuth from the /api group still
// populates c.user when present, for future personalization).
export const publicRouter = new Hono<Env>();

// Newest published quizzes. Optional ?tag=<name> filter (server normalizes the
// raw tag to its identity key); a present-but-unrecognizable tag yields [].
publicRouter.get("/quizzes", async (c) => {
  const tagRaw = c.req.query("tag");
  if (tagRaw !== undefined) {
    const t = normalizeTag(tagRaw);
    // present-but-unrecognizable tag → empty result (not "show everything")
    if (!t) return c.json({ quizzes: [] });
    const quizzes = await listPublishedQuizzes(c.env, { tagKey: t.key });
    return c.json({ quizzes });
  }
  const quizzes = await listPublishedQuizzes(c.env);
  return c.json({ quizzes });
});

// A single published quiz, in challenge form (no answers/explanations).
publicRouter.get("/quizzes/:id", async (c) => {
  const found = await loadPublishedQuiz(c.env, c.req.param("id"));
  if (!found) return c.json({ error: "not_found" }, 404);
  const tags = await listQuizTags(c.env, found.loaded.quiz.id);
  return c.json({ quiz: publicQuizJson(found.loaded, found.authorDisplayName, tags) });
});
