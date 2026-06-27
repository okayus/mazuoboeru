import { and, asc, count, desc, eq, inArray, isNull, sum } from "drizzle-orm";
import type { GradedQuestion } from "../domain/grading";
import { parseAcceptedAnswers } from "../domain/short-answer";
import { newId } from "../lib/id";
import type { Bindings } from "../types";
import { db } from "./client";
import { answer, choice, question, quiz, reviewList } from "./schema";

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

// The questions of ONE published quiz as drillable questions — the quiz-scoped Drill pool the
// "挑戦" entry point uses (CONTEXT.md Challenge/Drill; ADR-0013). Same DrillQuestion shape as the
// Review List pool, so the client renders both with one card. Returns undefined when the quiz
// isn't currently published & not deleted (the published gate → 404). is_correct is WITHHELD
// (graded server-side after submit, ADR-0010); the client shuffles the question order.
export async function loadQuizDrillPool(
  env: Bindings,
  quizId: string,
): Promise<{ quizTitle: string; items: DrillQuestion[] } | undefined> {
  const d = db(env);
  const qzRows = await d
    .select({ title: quiz.title })
    .from(quiz)
    .where(and(eq(quiz.id, quizId), eq(quiz.status, "published"), isNull(quiz.deletedAt)))
    .limit(1);
  const qz = qzRows[0];
  if (!qz) return undefined;

  const rows = await d
    .select({ questionId: question.id, type: question.type, prompt: question.prompt })
    .from(question)
    .where(eq(question.quizId, quizId))
    .orderBy(asc(question.position));

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

  return {
    quizTitle: qz.title,
    items: rows.map((r) => ({
      questionId: r.questionId,
      type: r.type,
      prompt: r.prompt,
      quizId,
      quizTitle: qz.title,
      choices: byQuestion.get(r.questionId) ?? [],
    })),
  };
}

// One drillable question for the single-question dialog opened from "my hot list" — a Drill
// scoped to one Review List question (CONTEXT.md Drill). Same DrillQuestion shape as the pools
// (prompt + choices, is_correct WITHHELD — ADR-0010), only if it belongs to a currently
// published, non-deleted quiz (the published gate → 404). Undefined when not currently drillable.
export async function loadDrillQuestion(
  env: Bindings,
  questionId: string,
): Promise<DrillQuestion | undefined> {
  const d = db(env);
  const rows = await d
    .select({
      type: question.type,
      prompt: question.prompt,
      quizId: quiz.id,
      quizTitle: quiz.title,
    })
    .from(question)
    .innerJoin(quiz, eq(question.quizId, quiz.id))
    .where(and(eq(question.id, questionId), eq(quiz.status, "published"), isNull(quiz.deletedAt)))
    .limit(1);
  const r = rows[0];
  if (!r) return undefined;

  // short → no choices (the client renders a text input); mcq → choices without is_correct.
  const choices =
    r.type === "short"
      ? []
      : (
          await d
            .select({ id: choice.id, text: choice.text, position: choice.position })
            .from(choice)
            .where(eq(choice.questionId, questionId))
        ).sort((a, b) => a.position - b.position);

  return {
    questionId,
    type: r.type,
    prompt: r.prompt,
    quizId: r.quizId,
    quizTitle: r.quizTitle,
    choices,
  };
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

// Append one Drill answer to the flat `answer` table (server-graded). No upsert, no uniqueness
// — every drill is a new Answer row (ADR-0008/0013). Feeds the dashboard (loadUserAnswerFacts /
// userQuestionStats). Name kept as recordReviewAnswer through Slice 1; consolidated in Slice 3.
export async function recordReviewAnswer(
  env: Bindings,
  params: { userId: string; questionId: string; isCorrect: boolean },
): Promise<void> {
  await db(env)
    .insert(answer)
    .values({
      id: newId(),
      userId: params.userId,
      questionId: params.questionId,
      isCorrect: params.isCorrect ? 1 : 0,
      answeredAt: Date.now(),
    });
}

// The caller's own all-time accuracy per question, over the flat `answer` table — activity-framed,
// re-answers included; every submission is an Answer now (ADR-0013). Shown during a Drill / 挑戦.
export async function userQuestionStats(
  env: Bindings,
  userId: string,
  questionIds: string[],
): Promise<Record<string, { correct: number; total: number }>> {
  const out: Record<string, { correct: number; total: number }> = {};
  if (!questionIds.length) return out;
  const rows = await db(env)
    .select({
      questionId: answer.questionId,
      total: count(),
      correct: sum(answer.isCorrect),
    })
    .from(answer)
    .where(and(eq(answer.userId, userId), inArray(answer.questionId, questionIds)))
    .groupBy(answer.questionId);
  for (const r of rows) {
    out[r.questionId] = { correct: Number(r.correct ?? 0), total: Number(r.total) };
  }
  return out;
}
