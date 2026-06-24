import { eq, inArray } from "drizzle-orm";
import type { Bindings } from "../types";
import { db } from "./client";
import { answer, question, quiz, quizTags } from "./schema";

export type UserAnswerFact = { isCorrect: boolean; answeredAt: number; quizId: string };

// All of a user's graded answers from the single flat `answer` table (ADR-0013) — re-answers
// included (activity-framed, ADR-0006), each resolved to the quiz it belongs to via its question
// (question->quiz). One source now feeds every dashboard metric (overall / streak / per-tag /
// per-quiz). No published filter (activity counts all answers); the inner join only resolves
// quizId and drops answers whose question was hard-deleted (a Phase 4 concern).
export async function loadUserAnswerFacts(
  env: Bindings,
  userId: string,
): Promise<UserAnswerFact[]> {
  const rows = await db(env)
    .select({
      isCorrect: answer.isCorrect,
      answeredAt: answer.answeredAt,
      quizId: question.quizId,
    })
    .from(answer)
    .innerJoin(question, eq(answer.questionId, question.id))
    .where(eq(answer.userId, userId));
  return rows.map((r) => ({
    isCorrect: r.isCorrect === 1,
    answeredAt: r.answeredAt,
    quizId: r.quizId,
  }));
}

// Quiz titles for the per-quiz dashboard axis (ADR-0013). Missing ids (e.g. a hard-deleted quiz)
// simply don't appear; the caller falls back to a placeholder.
export async function quizTitlesByIds(
  env: Bindings,
  quizIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!quizIds.length) return out;
  const rows = await db(env)
    .select({ id: quiz.id, title: quiz.title })
    .from(quiz)
    .where(inArray(quiz.id, quizIds));
  for (const r of rows) out.set(r.id, r.title);
  return out;
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
