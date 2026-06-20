import { eq, inArray } from "drizzle-orm";
import type { Bindings } from "../types";
import { db } from "./client";
import { attempt, attemptAnswer, question, quizTags, reviewAnswer } from "./schema";

export type UserAnswerFact = { isCorrect: boolean; answeredAt: number; quizId: string };

// All of a user's graded answers (re-attempts included — activity-framed, ADR-0006),
// each tagged with the quiz it belongs to (via its attempt).
export async function loadUserAnswerFacts(
  env: Bindings,
  userId: string,
): Promise<UserAnswerFact[]> {
  const rows = await db(env)
    .select({
      isCorrect: attemptAnswer.isCorrect,
      answeredAt: attemptAnswer.answeredAt,
      quizId: attempt.quizId,
    })
    .from(attemptAnswer)
    .innerJoin(attempt, eq(attemptAnswer.attemptId, attempt.id))
    .where(eq(attempt.userId, userId));
  return rows.map((r) => ({
    isCorrect: r.isCorrect === 1,
    answeredAt: r.answeredAt,
    quizId: r.quizId,
  }));
}

// All of a user's Drill answers (review_answer), each resolved to the quiz it belongs to via
// its question — the same UserAnswerFact shape as attempts, so the dashboard merges them
// uniformly (ADR-0006 2026-06-19: a drill answer is an answer). No published filter (activity
// counts all answers, like attempts); the inner join only resolves quizId and drops answers
// whose question was hard-deleted (a Phase 4 concern).
export async function loadUserDrillFacts(env: Bindings, userId: string): Promise<UserAnswerFact[]> {
  const rows = await db(env)
    .select({
      isCorrect: reviewAnswer.isCorrect,
      answeredAt: reviewAnswer.answeredAt,
      quizId: question.quizId,
    })
    .from(reviewAnswer)
    .innerJoin(question, eq(reviewAnswer.questionId, question.id))
    .where(eq(reviewAnswer.userId, userId));
  return rows.map((r) => ({
    isCorrect: r.isCorrect === 1,
    answeredAt: r.answeredAt,
    quizId: r.quizId,
  }));
}

// Authored tag ids per quiz (for effective-tag bundling on the dashboard).
export async function authoredTagIdsByQuiz(
  env: Bindings,
  quizIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!quizIds.length) return out;
  const rows = await db(env)
    .select({ quizId: quizTags.quizId, tagId: quizTags.tagId })
    .from(quizTags)
    .where(inArray(quizTags.quizId, quizIds));
  for (const r of rows) {
    const arr = out.get(r.quizId) ?? [];
    arr.push(r.tagId);
    out.set(r.quizId, arr);
  }
  return out;
}
