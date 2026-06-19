import { and, count, eq, inArray, isNull, sum } from "drizzle-orm";
import { newId } from "../lib/id";
import type { Bindings } from "../types";
import { db } from "./client";
import { type Attempt, attempt, type AttemptAnswer, attemptAnswer, reviewAnswer } from "./schema";

// At most one unfinished attempt per (user, quiz) — opening a quiz resumes it.
export async function findUnfinishedAttempt(
  env: Bindings,
  userId: string,
  quizId: string,
): Promise<Attempt | null> {
  const rows = await db(env)
    .select()
    .from(attempt)
    .where(
      and(
        eq(attempt.userId, userId),
        eq(attempt.quizId, quizId),
        isNull(attempt.finishedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createAttempt(
  env: Bindings,
  userId: string,
  quizId: string,
): Promise<Attempt> {
  const id = newId();
  const startedAt = Date.now();
  await db(env).insert(attempt).values({ id, userId, quizId, startedAt });
  return { id, userId, quizId, startedAt, finishedAt: null, score: null, total: null };
}

export async function getAttempt(
  env: Bindings,
  attemptId: string,
): Promise<Attempt | null> {
  const rows = await db(env)
    .select()
    .from(attempt)
    .where(eq(attempt.id, attemptId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAttemptAnswers(
  env: Bindings,
  attemptId: string,
): Promise<AttemptAnswer[]> {
  return db(env)
    .select()
    .from(attemptAnswer)
    .where(eq(attemptAnswer.attemptId, attemptId));
}

// Record one graded answer. The unique (attempt_id, question_id) index is the real
// guard against re-answering; callers also check first for a clean error.
export async function recordAnswer(
  env: Bindings,
  params: {
    attemptId: string;
    questionId: string;
    response: string;
    isCorrect: boolean;
  },
): Promise<void> {
  await db(env).insert(attemptAnswer).values({
    id: newId(),
    attemptId: params.attemptId,
    questionId: params.questionId,
    response: params.response,
    isCorrect: params.isCorrect ? 1 : 0,
    answeredAt: Date.now(),
  });
}

export async function finalizeAttempt(
  env: Bindings,
  attemptId: string,
  score: number,
  total: number,
): Promise<void> {
  await db(env)
    .update(attempt)
    .set({ finishedAt: Date.now(), score, total })
    .where(eq(attempt.id, attemptId));
}

// The caller's own all-time accuracy per question, across BOTH their attempts and their
// drills (review_answer) — activity-framed, re-answers included; a drill answer is an answer
// (ADR-0006, 2026-06-19). Shown during the challenge and the drill.
export async function userQuestionStats(
  env: Bindings,
  userId: string,
  questionIds: string[],
): Promise<Record<string, { correct: number; total: number }>> {
  const out: Record<string, { correct: number; total: number }> = {};
  if (!questionIds.length) return out;
  const d = db(env);
  const add = (questionId: string, total: number, correct: number) => {
    const cur = out[questionId] ?? { correct: 0, total: 0 };
    out[questionId] = { correct: cur.correct + correct, total: cur.total + total };
  };

  const attemptRows = await d
    .select({
      questionId: attemptAnswer.questionId,
      total: count(),
      correct: sum(attemptAnswer.isCorrect),
    })
    .from(attemptAnswer)
    .innerJoin(attempt, eq(attemptAnswer.attemptId, attempt.id))
    .where(and(eq(attempt.userId, userId), inArray(attemptAnswer.questionId, questionIds)))
    .groupBy(attemptAnswer.questionId);
  for (const r of attemptRows) add(r.questionId, Number(r.total), Number(r.correct ?? 0));

  const drillRows = await d
    .select({
      questionId: reviewAnswer.questionId,
      total: count(),
      correct: sum(reviewAnswer.isCorrect),
    })
    .from(reviewAnswer)
    .where(and(eq(reviewAnswer.userId, userId), inArray(reviewAnswer.questionId, questionIds)))
    .groupBy(reviewAnswer.questionId);
  for (const r of drillRows) add(r.questionId, Number(r.total), Number(r.correct ?? 0));

  return out;
}
