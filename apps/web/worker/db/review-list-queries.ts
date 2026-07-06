import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Bindings } from "../types";
import { db } from "./client";
import { question, quiz, reviewList } from "./schema";

// Review List = a user's private, question-level pool to revisit (CONTEXT.md Review
// List; replaces the quiz-level favorite, ADR-0008). All reads filter to active (not
// retired — ADR-0014) questions whose quiz is currently published & not deleted —
// orphaned rows (question retired / quiz soft-deleted) stay but drop off the view.

// Add a question to the Review List (idempotent — a second add is a no-op).
export async function addToReviewList(
  env: Bindings,
  userId: string,
  questionId: string,
): Promise<void> {
  await db(env)
    .insert(reviewList)
    .values({ userId, questionId, createdAt: Date.now() })
    .onConflictDoNothing();
}

export async function removeFromReviewList(
  env: Bindings,
  userId: string,
  questionId: string,
): Promise<void> {
  await db(env)
    .delete(reviewList)
    .where(and(eq(reviewList.userId, userId), eq(reviewList.questionId, questionId)));
}

// The subset of `questionIds` that are in the user's Review List. The 挑戦 (quiz Drill)
// and Drill views use this to mark each question's Review List toggle (membership).
export async function reviewListIdsAmong(
  env: Bindings,
  userId: string,
  questionIds: string[],
): Promise<string[]> {
  if (questionIds.length === 0) return [];
  const rows = await db(env)
    .select({ questionId: reviewList.questionId })
    .from(reviewList)
    .where(and(eq(reviewList.userId, userId), inArray(reviewList.questionId, questionIds)));
  return rows.map((r) => r.questionId);
}

// Whether a question exists and belongs to a currently published, non-deleted quiz.
// Gate for adding to the Review List: you can only add questions from a published quiz.
export async function publishedQuestionExists(env: Bindings, questionId: string): Promise<boolean> {
  const rows = await db(env)
    .select({ id: question.id })
    .from(question)
    .innerJoin(quiz, eq(question.quizId, quiz.id))
    .where(
      and(
        eq(question.id, questionId),
        eq(question.status, "active"),
        eq(quiz.status, "published"),
        isNull(quiz.deletedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// The user's Review List as displayable items, newest first, filtered to currently
// published questions. Each item carries the question prompt + its source quiz (title
// + id for the link) for the "my hot list" view.
export type ReviewListItem = {
  questionId: string;
  prompt: string;
  quizId: string;
  quizTitle: string;
  createdAt: number;
};

export async function listReviewListItems(
  env: Bindings,
  userId: string,
): Promise<ReviewListItem[]> {
  return db(env)
    .select({
      questionId: reviewList.questionId,
      prompt: question.prompt,
      quizId: quiz.id,
      quizTitle: quiz.title,
      createdAt: reviewList.createdAt,
    })
    .from(reviewList)
    .innerJoin(question, eq(reviewList.questionId, question.id))
    .innerJoin(quiz, eq(question.quizId, quiz.id))
    .where(
      and(
        eq(reviewList.userId, userId),
        eq(question.status, "active"),
        eq(quiz.status, "published"),
        isNull(quiz.deletedAt),
      ),
    )
    .orderBy(desc(reviewList.createdAt));
}
