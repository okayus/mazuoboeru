import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Bindings } from "../types";
import { db } from "./client";
import { type LoadedQuiz, loadQuizWithContent } from "./quiz-queries";
import { question, quiz, user } from "./schema";

export type TimelineItem = {
  id: string;
  title: string;
  description: string | null;
  authorDisplayName: string;
  publishedAt: number | null;
  questionCount: number;
};

// Public timeline: published, non-deleted quizzes, newest first. The canonical
// public filter is always status='published' AND deleted_at IS NULL (ADR-0002).
export async function listPublishedQuizzes(
  env: Bindings,
  limit = 50,
): Promise<TimelineItem[]> {
  const d = db(env);
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
    .where(and(eq(quiz.status, "published"), isNull(quiz.deletedAt)))
    .orderBy(desc(quiz.publishedAt))
    .limit(limit);

  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await d
        .select({ quizId: question.quizId, n: count() })
        .from(question)
        .where(inArray(question.quizId, ids))
        .groupBy(question.quizId)
    : [];
  const countByQuiz = new Map(counts.map((r) => [r.quizId, Number(r.n)]));

  return rows.map((r) => ({ ...r, questionCount: countByQuiz.get(r.id) ?? 0 }));
}

export type PublicQuiz = { loaded: LoadedQuiz; authorDisplayName: string };

// Load a quiz for public viewing / challenging. Returns null unless it is
// published and not deleted (drafts/hidden/deleted are 404 to non-authors).
export async function loadPublishedQuiz(
  env: Bindings,
  id: string,
): Promise<PublicQuiz | null> {
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
