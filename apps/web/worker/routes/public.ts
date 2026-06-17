import { Hono } from "hono";
import { listPublishedQuizzes, loadPublishedQuiz } from "../db/public-queries";
import {
  listQuizTags,
  loadTagEdges,
  quizIdsWithTagIds,
  tagIdByKey,
  tagNamesByIds,
} from "../db/tag-queries";
import { normalizeTag } from "../domain/tag";
import { childIds, descendantIds, parentIds } from "../domain/tag-graph";
import { publicQuizJson } from "../presenters/quiz";
import type { Env } from "../types";

// Public read surface — no auth required (optionalAuth from the /api group still
// populates c.user when present, for future personalization).
export const publicRouter = new Hono<Env>();

// Newest published quizzes. Optional ?tag=<name> filter: matches the tag itself plus
// all its narrower (descendant) tags via the subsumption DAG (ADR-0007 effective
// match), and returns the tag's immediate broader/narrower neighbours for drill chips.
publicRouter.get("/quizzes", async (c) => {
  const tagRaw = c.req.query("tag");
  if (tagRaw === undefined) {
    return c.json({ quizzes: await listPublishedQuizzes(c.env) });
  }
  const t = normalizeTag(tagRaw);
  const tagId = t ? await tagIdByKey(c.env, t.key) : null;
  // present-but-unrecognizable tag → empty result (not "show everything")
  if (!tagId) return c.json({ quizzes: [], related: { broader: [], narrower: [] } });

  const edges = await loadTagEdges(c.env);
  const matchIds = [tagId, ...descendantIds(edges, tagId)];
  const restrictQuizIds = await quizIdsWithTagIds(c.env, matchIds);
  const quizzes = await listPublishedQuizzes(c.env, { restrictQuizIds });
  const [broader, narrower] = await Promise.all([
    tagNamesByIds(c.env, parentIds(edges, tagId)),
    tagNamesByIds(c.env, childIds(edges, tagId)),
  ]);
  return c.json({ quizzes, related: { broader, narrower } });
});

// A single published quiz, in challenge form (no answers/explanations).
publicRouter.get("/quizzes/:id", async (c) => {
  const found = await loadPublishedQuiz(c.env, c.req.param("id"));
  if (!found) return c.json({ error: "not_found" }, 404);
  const tags = await listQuizTags(c.env, found.loaded.quiz.id);
  return c.json({ quiz: publicQuizJson(found.loaded, found.authorDisplayName, tags) });
});
