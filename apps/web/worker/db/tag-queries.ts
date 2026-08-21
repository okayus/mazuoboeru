import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { NormalizedTag } from "../domain/tag";
import { newId } from "../lib/id";
import type { Bindings } from "../types";
import { db } from "./client";
import { quiz, quizTags, tag } from "./schema";

// D1 binds at most 100 parameters per statement; id lists are chunked below that.
const IN_CHUNK = 90;

function chunks<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

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

// Resolve normalized tag keys to ids. Keys nobody has authored are simply absent.
export async function tagIdsByKeys(env: Bindings, keys: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!keys.length) return m;
  const rows = await db(env)
    .select({ id: tag.id, nameKey: tag.nameKey })
    .from(tag)
    .where(inArray(tag.nameKey, keys));
  for (const r of rows) m.set(r.nameKey, r.id);
  return m;
}

// The published tag incidence: one (quiz, tag) row per authored tag of every published,
// non-deleted quiz. This is the ONLY input the Related Tags pure functions
// (@mazuoboeru/core) receive — drafts / hidden / deleted quizzes also have quiz_tags
// rows, and a count is an existence signal, so the canonical public filter
// (status='published' AND deleted_at IS NULL — ADR-0002) is applied here (ADR-0016).
export async function publishedQuizTagRows(
  env: Bindings,
): Promise<Array<{ itemId: string; tagId: string }>> {
  return db(env)
    .select({ itemId: quizTags.quizId, tagId: quizTags.tagId })
    .from(quizTags)
    .innerJoin(quiz, eq(quizTags.quizId, quiz.id))
    .where(and(eq(quiz.status, "published"), isNull(quiz.deletedAt)));
}

// The same published incidence, joined with what the tag-exploration graph needs to show
// it: the quiz title and the tag's display name (ADR-0016). Newest quiz first. Same
// canonical public filter as above — a tag that exists only on drafts must not appear.
export async function publishedTagGraphRows(
  env: Bindings,
): Promise<Array<{ quizId: string; title: string; tagId: string; tagName: string }>> {
  return db(env)
    .select({
      quizId: quizTags.quizId,
      title: quiz.title,
      tagId: quizTags.tagId,
      tagName: tag.name,
    })
    .from(quizTags)
    .innerJoin(quiz, eq(quizTags.quizId, quiz.id))
    .innerJoin(tag, eq(quizTags.tagId, tag.id))
    .where(and(eq(quiz.status, "published"), isNull(quiz.deletedAt)))
    .orderBy(desc(quiz.publishedAt), quiz.id, tag.name);
}

// Tag id → display name map, for buckets/counts keyed by id (dashboard, Related Tags).
// Chunked: a popularity list or a heavy user's tag buckets can exceed D1's 100-param cap.
export async function tagNameMap(env: Bindings, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const part of chunks([...new Set(ids)], IN_CHUNK)) {
    const rows = await db(env)
      .select({ id: tag.id, name: tag.name })
      .from(tag)
      .where(inArray(tag.id, part));
    for (const r of rows) m.set(r.id, r.name);
  }
  return m;
}
