import { eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { NormalizedTag } from "../domain/tag";
import type { Edge } from "../domain/tag-graph";
import { newId } from "../lib/id";
import type { Bindings } from "../types";
import { db } from "./client";
import { quizTags, tag, tagEdge } from "./schema";

// Replace a quiz's tags with `tags` (find-or-create each by key, then swap the
// quiz_tags rows). Atomic via D1 batch. Pass [] to clear all tags. Callers
// normalize first with parseTags() (dedup + cap + validation).
export async function setQuizTags(
  env: Bindings,
  quizId: string,
  tags: NormalizedTag[],
): Promise<void> {
  const d = db(env);
  const keys = tags.map((t) => t.key);
  const existing = keys.length ? await d.select().from(tag).where(inArray(tag.nameKey, keys)) : [];
  const idByKey = new Map(existing.map((row) => [row.nameKey, row.id]));

  const now = Date.now();
  const newTagRows: Array<typeof tag.$inferInsert> = [];
  for (const t of tags) {
    if (idByKey.has(t.key)) continue;
    const id = newId();
    idByKey.set(t.key, id);
    newTagRows.push({ id, name: t.name, nameKey: t.key, createdAt: now });
  }
  const quizTagRows = tags.map((t) => ({ quizId, tagId: idByKey.get(t.key) as string }));

  // delete is always present so the batch is non-empty; insert tags before the
  // join rows that reference them.
  const stmts: BatchItem<"sqlite">[] = [];
  if (newTagRows.length) stmts.push(d.insert(tag).values(newTagRows));
  stmts.push(d.delete(quizTags).where(eq(quizTags.quizId, quizId)));
  if (quizTagRows.length) stmts.push(d.insert(quizTags).values(quizTagRows));
  await d.batch(stmts as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

// Display tag names for a set of quizzes, grouped by quiz id (alphabetical).
export async function tagsForQuizzes(
  env: Bindings,
  quizIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!quizIds.length) return out;
  const rows = await db(env)
    .select({ quizId: quizTags.quizId, name: tag.name })
    .from(quizTags)
    .innerJoin(tag, eq(quizTags.tagId, tag.id))
    .where(inArray(quizTags.quizId, quizIds))
    .orderBy(tag.name);
  for (const r of rows) {
    const arr = out.get(r.quizId) ?? [];
    arr.push(r.name);
    out.set(r.quizId, arr);
  }
  return out;
}

// Display tag names for one quiz (alphabetical).
export async function listQuizTags(env: Bindings, quizId: string): Promise<string[]> {
  return (await tagsForQuizzes(env, [quizId])).get(quizId) ?? [];
}

// Resolve a normalized tag key to its id (null if no such tag).
export async function tagIdByKey(env: Bindings, key: string): Promise<string | null> {
  const rows = await db(env).select({ id: tag.id }).from(tag).where(eq(tag.nameKey, key)).limit(1);
  return rows[0]?.id ?? null;
}

// Quiz ids authored-tagged with ANY of the given tag ids (deduped). The broad-tag
// filter passes a tag id plus its descendants (ADR-0007 effective match).
export async function quizIdsWithTagIds(env: Bindings, tagIds: string[]): Promise<string[]> {
  if (!tagIds.length) return [];
  const rows = await db(env)
    .select({ quizId: quizTags.quizId })
    .from(quizTags)
    .where(inArray(quizTags.tagId, tagIds));
  return [...new Set(rows.map((r) => r.quizId))];
}

// Display names for a set of tag ids (alphabetical) — for drill-down chips.
export async function tagNamesByIds(env: Bindings, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db(env)
    .select({ name: tag.name })
    .from(tag)
    .where(inArray(tag.id, ids))
    .orderBy(tag.name);
  return rows.map((r) => r.name);
}

// All subsumption edges. The tag graph is small — load once and traverse in memory
// (worker/domain/tag-graph.ts).
export async function loadTagEdges(env: Bindings): Promise<Edge[]> {
  return db(env)
    .select({ narrowerId: tagEdge.narrowerId, broaderId: tagEdge.broaderId })
    .from(tagEdge);
}

// Tag id → display name map, for buckets keyed by id (e.g. the dashboard).
export async function tagNameMap(env: Bindings, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!ids.length) return m;
  const rows = await db(env)
    .select({ id: tag.id, name: tag.name })
    .from(tag)
    .where(inArray(tag.id, ids));
  for (const r of rows) m.set(r.id, r.name);
  return m;
}
