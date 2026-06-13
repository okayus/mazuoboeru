import { Hono } from "hono";
import { listPublishedQuizzes, loadPublishedQuiz } from "../db/public-queries";
import { publicQuizJson } from "../presenters/quiz";
import type { Env } from "../types";

// Public read surface — no auth required (optionalAuth from the /api group still
// populates c.user when present, for future personalization).
export const publicRouter = new Hono<Env>();

// Newest published quizzes.
publicRouter.get("/quizzes", async (c) => {
  const quizzes = await listPublishedQuizzes(c.env);
  return c.json({ quizzes });
});

// A single published quiz, in challenge form (no answers/explanations).
publicRouter.get("/quizzes/:id", async (c) => {
  const found = await loadPublishedQuiz(c.env, c.req.param("id"));
  if (!found) return c.json({ error: "not_found" }, 404);
  return c.json({ quiz: publicQuizJson(found.loaded, found.authorDisplayName) });
});
