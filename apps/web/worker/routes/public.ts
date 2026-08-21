import { groupTags, relatedTagCounts } from "@mazuoboeru/core";
import { Hono } from "hono";
import { listPublishedQuizzes, loadPublishedQuiz } from "../db/public-queries";
import {
  listQuizTags,
  publishedQuizTagRows,
  publishedTagGraphRows,
  tagIdsByKeys,
  tagNameMap,
} from "../db/tag-queries";
import { normalizeTag } from "../domain/tag";
import { apiError } from "../http/errors";
import { publicQuizJson } from "../presenters/quiz";
import { tagGraphJson } from "../presenters/tag-graph";
import type { Env } from "../types";

// `?tags=a&tags=b` (repeated, never comma-joined — a tag name may contain a comma) →
// normalized keys; blank/invalid dropped, deduped in order.
function selectedTagKeys(raw: string[] | undefined): string[] {
  const out: string[] = [];
  for (const r of raw ?? []) {
    const t = normalizeTag(r);
    if (t && !out.includes(t.key)) out.push(t.key);
  }
  return out;
}

// Public read surface — no auth required (optionalAuth from the /api group still
// populates c.user when present, for future personalization).
export const publicRouter = new Hono<Env>()
  // Newest published quizzes, optionally narrowed by `?tags=` — every selected tag must be
  // authored on the quiz (AND, exact match by normalized key; tags are flat — ADR-0016).
  // `related` is always present: the Related Tags of the selection (CONTEXT.md) = the tags
  // carried by the matching published quizzes, minus the selection, each with how many of
  // those quizzes carry it (count desc). With no selection that is every tag's count — the
  // popularity list. The quiz list keeps the timeline's newest-50 cap; `related` is computed
  // over ALL matching quizzes. One response shape on every branch (ADR-0011).
  .get("/quizzes", async (c) => {
    const keys = selectedTagKeys(c.req.queries("tags"));
    const idByKey = await tagIdsByKeys(c.env, keys);
    // A selected tag nobody has authored matches nothing (not "show everything").
    if (keys.some((k) => !idByKey.has(k))) return c.json({ quizzes: [], related: [] });
    const selected = keys.map((k) => idByKey.get(k) as string);

    const [quizzes, rows] = await Promise.all([
      listPublishedQuizzes(c.env, selected.length ? { withAllTagIds: selected } : {}),
      publishedQuizTagRows(c.env),
    ]);
    const counts = relatedTagCounts(groupTags(rows), selected);
    const nameById = await tagNameMap(
      c.env,
      counts.map((r) => r.tagId),
    );
    const related = counts
      .map((r) => ({ name: nameById.get(r.tagId) ?? "?", count: r.count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return c.json({ quizzes, related });
  })

  // A single published quiz, in challenge form (no answers/explanations).
  .get("/quizzes/:id", async (c) => {
    const found = await loadPublishedQuiz(c.env, c.req.param("id"));
    if (!found) return c.json(apiError("not_found"), 404);
    const tags = await listQuizTags(c.env, found.loaded.quiz.id);
    return c.json({ quiz: publicQuizJson(found.loaded, found.authorDisplayName, tags) });
  })

  // The tag-exploration graph's raw material (ADR-0016): every published quiz's authored
  // tag set plus the tags on them — no cap (the timeline's newest-50 is a list concern).
  // Counts / co-occurrence / AND narrowing / Related Tags / the matching list are derived
  // on the client (`#/tags`) with the same @mazuoboeru/core functions `?tags=` uses, so
  // both surfaces agree. Built from published rows only, so a tag that exists only on
  // drafts or hidden quizzes is absent (its presence would be an existence signal).
  .get("/tag-graph", async (c) => c.json(tagGraphJson(await publishedTagGraphRows(c.env))));
