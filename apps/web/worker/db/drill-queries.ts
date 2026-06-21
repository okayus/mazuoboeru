import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { GradedQuestion } from "../domain/grading";
import { parseAcceptedAnswers } from "../domain/short-answer";
import { newId } from "../lib/id";
import type { Bindings } from "../types";
import { db } from "./client";
import { choice, question, quiz, reviewAnswer, reviewList } from "./schema";

// Drill = re-answering Review List questions one at a time (CONTEXT.md Drill; ADR-0008).
// These queries serve the stateless drill loop: load the whole pool once (questions +
// choices, never is_correct), grade one answer, append it. There is no server cursor /
// session — the client walks the fetched pool (whole-pool fetch, ADR-0008).

// One drillable question: prompt + its choices (is_correct WITHHELD — the client must not
// see the answer key before grading; ADR-0010) + its source quiz for display.
export type DrillQuestion = {
  questionId: string;
  type: "mcq_single" | "mcq_multi" | "short";
  prompt: string;
  quizId: string;
  quizTitle: string;
  // mcq: the choices (no is_correct). short: empty — the client renders a text input.
  choices: { id: string; text: string; position: number }[];
};

// The user's Review List as drillable questions, newest first, filtered to questions whose
// quiz is currently published & not deleted (orphaned rows drop off the view, like the list).
export async function loadDrillPool(env: Bindings, userId: string): Promise<DrillQuestion[]> {
  const d = db(env);
  const rows = await d
    .select({
      questionId: reviewList.questionId,
      type: question.type,
      prompt: question.prompt,
      quizId: quiz.id,
      quizTitle: quiz.title,
    })
    .from(reviewList)
    .innerJoin(question, eq(reviewList.questionId, question.id))
    .innerJoin(quiz, eq(question.quizId, quiz.id))
    .where(and(eq(reviewList.userId, userId), eq(quiz.status, "published"), isNull(quiz.deletedAt)))
    .orderBy(desc(reviewList.createdAt));

  const ids = rows.map((r) => r.questionId);
  const choiceRows = ids.length
    ? await d
        .select({
          id: choice.id,
          questionId: choice.questionId,
          text: choice.text,
          position: choice.position,
        })
        .from(choice)
        .where(inArray(choice.questionId, ids))
    : [];
  const byQuestion = new Map<string, { id: string; text: string; position: number }[]>();
  for (const cr of choiceRows) {
    const arr = byQuestion.get(cr.questionId) ?? [];
    arr.push({ id: cr.id, text: cr.text, position: cr.position });
    byQuestion.set(cr.questionId, arr);
  }
  for (const arr of byQuestion.values()) arr.sort((a, b) => a.position - b.position);

  return rows.map((r) => ({
    questionId: r.questionId,
    type: r.type,
    prompt: r.prompt,
    quizId: r.quizId,
    quizTitle: r.quizTitle,
    choices: byQuestion.get(r.questionId) ?? [],
  }));
}

// Load one question for Drill grading — only if it belongs to a currently published,
// non-deleted quiz (the boundary's published gate; gradeQuestion itself stays pure). Returns
// the GradedQuestion (choices WITH is_correct, used only server-side) + its explanation
// (revealed after grading), or undefined when the question isn't drillable.
export async function loadGradedQuestion(
  env: Bindings,
  questionId: string,
): Promise<{ question: GradedQuestion; explanation: string | null } | undefined> {
  const d = db(env);
  const qrows = await d
    .select({
      id: question.id,
      type: question.type,
      explanation: question.explanation,
      answer: question.answer,
    })
    .from(question)
    .innerJoin(quiz, eq(question.quizId, quiz.id))
    .where(and(eq(question.id, questionId), eq(quiz.status, "published"), isNull(quiz.deletedAt)))
    .limit(1);
  const q = qrows[0];
  if (!q) return undefined;
  if (q.type === "short") {
    return {
      question: { id: q.id, type: "short", accept: parseAcceptedAnswers(q.answer) },
      explanation: q.explanation,
    };
  }
  const choiceRows = await d
    .select({ id: choice.id, isCorrect: choice.isCorrect })
    .from(choice)
    .where(eq(choice.questionId, questionId));
  return {
    question: {
      id: q.id,
      type: q.type,
      choices: choiceRows.map((cr) => ({ id: cr.id, isCorrect: cr.isCorrect === 1 })),
    },
    explanation: q.explanation,
  };
}

// Append one Drill answer (server-graded). No upsert, no uniqueness — every drill is a new
// row (ADR-0008). Feeds the dashboard via loadUserDrillFacts / userQuestionStats.
export async function recordReviewAnswer(
  env: Bindings,
  params: { userId: string; questionId: string; isCorrect: boolean },
): Promise<void> {
  await db(env)
    .insert(reviewAnswer)
    .values({
      id: newId(),
      userId: params.userId,
      questionId: params.questionId,
      isCorrect: params.isCorrect ? 1 : 0,
      answeredAt: Date.now(),
    });
}
