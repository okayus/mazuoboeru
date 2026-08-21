import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Bindings } from "../types";
import { db } from "./client";
import { type LoadedQuiz, loadQuizWithContent } from "./quiz-queries";
import { question, quiz, quizTags, user } from "./schema";
import { tagsForQuizzes } from "./tag-queries";

export type TimelineItem = {
  id: string;
  title: string;
  description: string | null;
  authorDisplayName: string;
  publishedAt: number | null;
  questionCount: number;
  tags: string[];
};

// Public timeline: published, non-deleted quizzes, newest first. The canonical
// public filter is always status='published' AND deleted_at IS NULL (ADR-0002).
// `withAllTagIds`, when given, keeps only quizzes authored-tagged with EVERY listed tag
// (AND — tags are flat, ADR-0016). It is a grouped subquery so the statement binds one
// param per selected tag: D1 caps bound params at 100 per statement, and an id list of
// the matching quizzes would stop fitting as a tag gets popular.
export async function listPublishedQuizzes(
  env: Bindings,
  opts: { limit?: number; withAllTagIds?: string[] } = {},
): Promise<TimelineItem[]> {
  const d = db(env);
  const limit = opts.limit ?? 50;
  const tagIds = [...new Set(opts.withAllTagIds ?? [])];
  const taggedWithAll = tagIds.length
    ? [
        inArray(
          quiz.id,
          d
            .select({ quizId: quizTags.quizId })
            .from(quizTags)
            .where(inArray(quizTags.tagId, tagIds))
            .groupBy(quizTags.quizId)
            .having(sql`count(distinct ${quizTags.tagId}) = ${tagIds.length}`),
        ),
      ]
    : [];

  const rows = await d
    .select({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      publishedAt: quiz.publishedAt,
      authorDisplayName: user.displayName,
    })
    .from(quiz)
    .innerJoin(user, eq(quiz.authorId, user.id))
    .where(and(eq(quiz.status, "published"), isNull(quiz.deletedAt), ...taggedWithAll))
    .orderBy(desc(quiz.publishedAt))
    .limit(limit);

  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await d
        .select({ quizId: question.quizId, n: count() })
        .from(question)
        .where(and(inArray(question.quizId, ids), eq(question.status, "active")))
        .groupBy(question.quizId)
    : [];
  const countByQuiz = new Map(counts.map((r) => [r.quizId, Number(r.n)]));
  const tagsByQuiz = await tagsForQuizzes(env, ids);

  return rows.map((r) => ({
    ...r,
    questionCount: countByQuiz.get(r.id) ?? 0,
    tags: tagsByQuiz.get(r.id) ?? [],
  }));
}

export type PublicQuiz = { loaded: LoadedQuiz; authorDisplayName: string };

// Load a quiz for public viewing / challenging. Returns null unless it is
// published and not deleted (drafts/hidden/deleted are 404 to non-authors).
export async function loadPublishedQuiz(env: Bindings, id: string): Promise<PublicQuiz | null> {
  const loaded = await loadQuizWithContent(env, id);
  if (!loaded || loaded.quiz.status !== "published" || loaded.quiz.deletedAt !== null) {
    return null;
  }
  const authorRows = await db(env)
    .select({ displayName: user.displayName })
    .from(user)
    .where(eq(user.id, loaded.quiz.authorId))
    .limit(1);
  return { loaded, authorDisplayName: authorRows[0]?.displayName ?? "unknown" };
}
