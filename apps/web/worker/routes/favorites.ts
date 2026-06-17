import { Hono } from "hono";
import { requireAuth, requireUser } from "../auth/middleware";
import { addFavorite, favoritedQuizIds, removeFavorite } from "../db/favorite-queries";
import { listPublishedQuizzes, loadPublishedQuiz } from "../db/public-queries";
import type { Env } from "../types";

// Favorites ("my hot") — session-only, private. Quiz-level (CONTEXT.md Favorite).
export const favoritesRouter = new Hono<Env>();
favoritesRouter.use("*", requireAuth);

// My favorited quizzes, as timeline items (filtered to currently-published).
favoritesRouter.get("/", async (c) => {
  const user = requireUser(c);
  const ids = await favoritedQuizIds(c.env, user.id);
  const quizzes = await listPublishedQuizzes(c.env, { restrictQuizIds: ids });
  return c.json({ quizzes });
});

// Favorite a published quiz (idempotent). 404 if the quiz isn't publicly available.
favoritesRouter.post("/:quizId", async (c) => {
  const user = requireUser(c);
  const quizId = c.req.param("quizId");
  const found = await loadPublishedQuiz(c.env, quizId);
  if (!found) return c.json({ error: "not_found" }, 404);
  await addFavorite(c.env, user.id, quizId);
  return c.json({ ok: true, favorited: true });
});

favoritesRouter.delete("/:quizId", async (c) => {
  const user = requireUser(c);
  await removeFavorite(c.env, user.id, c.req.param("quizId"));
  return c.json({ ok: true, favorited: false });
});
