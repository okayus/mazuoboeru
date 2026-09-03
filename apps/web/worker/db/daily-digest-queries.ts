import { and, asc, count, countDistinct, eq, gte, isNull, lt, sum } from "drizzle-orm";
import type { Bindings } from "../types";
import { db } from "./client";
import { answer, quiz } from "./schema";

export type DailyActivity = {
  answers: { total: number; correct: number; answerers: number };
  publishedQuizzes: { id: string; title: string }[];
};

// Service-wide activity inside [startMs, endMs) for the Daily Digest (ADR-0017):
// aggregate answer counts (everyone's — activity-framed like the dashboard, ADR-0006:
// re-answers included, no published filter) and the quizzes that went published in the
// window AND are still publicly visible (a same-day hide / soft-delete drops out).
// The answered_at range scan has no dedicated index ((user_id, answered_at) can't
// serve a user-less range); once a day at the current table size that's fine.
export async function loadDailyActivity(
  env: Bindings,
  window: { startMs: number; endMs: number },
): Promise<DailyActivity> {
  const d = db(env);

  const [totals] = await d
    .select({
      total: count(),
      correct: sum(answer.isCorrect),
      answerers: countDistinct(answer.userId),
    })
    .from(answer)
    .where(and(gte(answer.answeredAt, window.startMs), lt(answer.answeredAt, window.endMs)));

  const publishedQuizzes = await d
    .select({ id: quiz.id, title: quiz.title })
    .from(quiz)
    .where(
      and(
        eq(quiz.status, "published"),
        isNull(quiz.deletedAt),
        gte(quiz.publishedAt, window.startMs),
        lt(quiz.publishedAt, window.endMs),
      ),
    )
    .orderBy(asc(quiz.publishedAt));

  return {
    answers: {
      total: Number(totals?.total ?? 0),
      correct: Number(totals?.correct ?? 0),
      answerers: Number(totals?.answerers ?? 0),
    },
    publishedQuizzes,
  };
}
