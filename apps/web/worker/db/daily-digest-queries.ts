import { and, asc, count, countDistinct, eq, gte, isNull, lt, sum } from "drizzle-orm";
import type { Bindings } from "../types";
import { db } from "./client";
import { answer, question, quiz, quizTags, tag } from "./schema";

export type DailyActivity = {
  answers: { total: number; correct: number; answerers: number };
  publishedQuizzes: { id: string; title: string }[];
  answeredTags: { name: string; answers: number }[];
  publishedTags: string[];
};

// Service-wide activity inside [startMs, endMs) for the Daily Digest (ADR-0017):
// aggregate answer counts (everyone's — activity-framed like the dashboard, ADR-0006:
// re-answers included, no published filter), the quizzes that went published in the
// window AND are still publicly visible (a same-day hide / soft-delete drops out), and
// the tags of the day's quizzes (補記 2026-09-11) — read under that same still-visible
// rule, since these are names that leave the service, not just counts.
// The answered_at range scan has no dedicated index ((user_id, answered_at) can't
// serve a user-less range); once a day at the current table size that's fine.
export async function loadDailyActivity(
  env: Bindings,
  window: { startMs: number; endMs: number },
): Promise<DailyActivity> {
  const d = db(env);
  const inWindow = and(gte(answer.answeredAt, window.startMs), lt(answer.answeredAt, window.endMs));
  const stillPublic = and(eq(quiz.status, "published"), isNull(quiz.deletedAt));
  const publishedInWindow = and(
    stillPublic,
    gte(quiz.publishedAt, window.startMs),
    lt(quiz.publishedAt, window.endMs),
  );

  const [totals] = await d
    .select({
      total: count(),
      correct: sum(answer.isCorrect),
      answerers: countDistinct(answer.userId),
    })
    .from(answer)
    .where(inWindow);

  const publishedQuizzes = await d
    .select({ id: quiz.id, title: quiz.title })
    .from(quiz)
    .where(publishedInWindow)
    .orderBy(asc(quiz.publishedAt));

  // Tags on the still-public quizzes the day's answers landed on, each with how many of
  // those answers its quizzes took: answer -> question -> quiz -> quiz_tags -> tag. An
  // answer counts once per tag its quiz carries (the dashboard's per-tag multi-counting,
  // ADR-0006). Grouped in SQL so no id list has to travel back into a query.
  const answeredTags = await d
    .select({ name: tag.name, answers: count() })
    .from(answer)
    .innerJoin(question, eq(question.id, answer.questionId))
    .innerJoin(quiz, eq(quiz.id, question.quizId))
    .innerJoin(quizTags, eq(quizTags.quizId, quiz.id))
    .innerJoin(tag, eq(tag.id, quizTags.tagId))
    .where(and(inWindow, stillPublic))
    .groupBy(tag.id, tag.name);

  // Tags on the quizzes published in the window (the same rows as publishedQuizzes).
  const publishedTagRows = await d
    .select({ name: tag.name })
    .from(quiz)
    .innerJoin(quizTags, eq(quizTags.quizId, quiz.id))
    .innerJoin(tag, eq(tag.id, quizTags.tagId))
    .where(publishedInWindow)
    .groupBy(tag.id, tag.name);

  return {
    answers: {
      total: Number(totals?.total ?? 0),
      correct: Number(totals?.correct ?? 0),
      answerers: Number(totals?.answerers ?? 0),
    },
    publishedQuizzes,
    answeredTags: answeredTags.map((r) => ({ name: r.name, answers: Number(r.answers) })),
    publishedTags: publishedTagRows.map((r) => r.name),
  };
}
