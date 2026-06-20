import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { newId } from "../lib/id";
import type { Bindings } from "../types";
import { db } from "./client";
import { choice, question, quiz, type Quiz } from "./schema";

export type QuizContentInput = {
  title: string;
  description: string | null;
  questions: Array<{
    type: "mcq_single" | "mcq_multi";
    prompt: string;
    explanation: string | null;
    choices: Array<{ text: string; isCorrect: boolean }>;
  }>;
};

export type LoadedChoice = {
  id: string;
  text: string;
  isCorrect: boolean;
  position: number;
};
export type LoadedQuestion = {
  id: string;
  type: "mcq_single" | "mcq_multi";
  prompt: string;
  explanation: string | null;
  position: number;
  choices: LoadedChoice[];
};
export type LoadedQuiz = { quiz: Quiz; questions: LoadedQuestion[] };

// Load a quiz with its questions and choices (full fidelity, incl is_correct).
// Callers decide what to expose — never send is_correct/explanation to a challenger
// before grading.
export async function loadQuizWithContent(
  env: Bindings,
  quizId: string,
): Promise<LoadedQuiz | null> {
  const d = db(env);
  const quizRows = await d.select().from(quiz).where(eq(quiz.id, quizId)).limit(1);
  const q = quizRows[0];
  if (!q) return null;

  const questionRows = await d
    .select()
    .from(question)
    .where(eq(question.quizId, quizId))
    .orderBy(question.position);
  const qIds = questionRows.map((r) => r.id);
  const choiceRows = qIds.length
    ? await d.select().from(choice).where(inArray(choice.questionId, qIds)).orderBy(choice.position)
    : [];

  const byQuestion = new Map<string, LoadedChoice[]>();
  for (const ch of choiceRows) {
    const arr = byQuestion.get(ch.questionId) ?? [];
    arr.push({ id: ch.id, text: ch.text, isCorrect: ch.isCorrect === 1, position: ch.position });
    byQuestion.set(ch.questionId, arr);
  }

  const questions: LoadedQuestion[] = questionRows.map((r) => ({
    id: r.id,
    type: r.type,
    prompt: r.prompt,
    explanation: r.explanation,
    position: r.position,
    choices: byQuestion.get(r.id) ?? [],
  }));
  return { quiz: q, questions };
}

function contentStatements(
  d: ReturnType<typeof db>,
  quizId: string,
  input: QuizContentInput,
): BatchItem<"sqlite">[] {
  const questionRows: Array<typeof question.$inferInsert> = [];
  const choiceRows: Array<typeof choice.$inferInsert> = [];
  input.questions.forEach((qn, qi) => {
    const qId = newId();
    questionRows.push({
      id: qId,
      quizId,
      type: qn.type,
      prompt: qn.prompt,
      explanation: qn.explanation,
      position: qi,
    });
    qn.choices.forEach((ch, ci) => {
      choiceRows.push({
        id: newId(),
        questionId: qId,
        text: ch.text,
        isCorrect: ch.isCorrect ? 1 : 0,
        position: ci,
      });
    });
  });
  const stmts: BatchItem<"sqlite">[] = [];
  if (questionRows.length) stmts.push(d.insert(question).values(questionRows));
  if (choiceRows.length) stmts.push(d.insert(choice).values(choiceRows));
  return stmts;
}

// Create a draft quiz with its content, atomically (D1 batch).
export async function createDraftQuiz(
  env: Bindings,
  authorId: string,
  input: QuizContentInput,
): Promise<string> {
  const d = db(env);
  const quizId = newId();
  const now = Date.now();
  const stmts: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
    d.insert(quiz).values({
      id: quizId,
      authorId,
      title: input.title,
      description: input.description,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    }),
    ...contentStatements(d, quizId, input),
  ];
  await d.batch(stmts);
  return quizId;
}

// Replace a draft's title/description and all of its questions+choices, atomically.
// Caller guarantees the quiz is the author's and still a draft.
export async function replaceDraftContent(
  env: Bindings,
  quizId: string,
  input: QuizContentInput,
): Promise<void> {
  const d = db(env);
  const now = Date.now();
  const existing = await d
    .select({ id: question.id })
    .from(question)
    .where(eq(question.quizId, quizId));
  const existingIds = existing.map((r) => r.id);
  const stmts: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
    d
      .update(quiz)
      .set({ title: input.title, description: input.description, updatedAt: now })
      .where(eq(quiz.id, quizId)),
  ];
  // choices cascade-delete with their question, so deleting questions is enough.
  if (existingIds.length) {
    stmts.push(d.delete(question).where(inArray(question.id, existingIds)));
  }
  for (const s of contentStatements(d, quizId, input)) stmts.push(s);
  await d.batch(stmts);
}

// Minor edit allowed post-publish: title/description only (ADR-0002).
export async function updateQuizMeta(
  env: Bindings,
  quizId: string,
  fields: { title: string; description: string | null },
): Promise<void> {
  await db(env)
    .update(quiz)
    .set({ title: fields.title, description: fields.description, updatedAt: Date.now() })
    .where(eq(quiz.id, quizId));
}

// Irreversible draft -> published transition (caller has run the publish gate).
export async function publishQuiz(env: Bindings, quizId: string): Promise<void> {
  const now = Date.now();
  await db(env)
    .update(quiz)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(eq(quiz.id, quizId));
}

export async function softDeleteQuiz(
  env: Bindings,
  authorId: string,
  quizId: string,
): Promise<boolean> {
  const owned = await db(env)
    .select({ id: quiz.id })
    .from(quiz)
    .where(and(eq(quiz.id, quizId), eq(quiz.authorId, authorId), isNull(quiz.deletedAt)))
    .limit(1);
  if (!owned[0]) return false;
  await db(env).update(quiz).set({ deletedAt: Date.now() }).where(eq(quiz.id, quizId));
  return true;
}

export type AuthorQuizSummary = {
  id: string;
  title: string;
  status: "draft" | "published" | "hidden";
  createdAt: number;
  publishedAt: number | null;
};

export async function listQuizzesByAuthor(
  env: Bindings,
  authorId: string,
): Promise<AuthorQuizSummary[]> {
  return db(env)
    .select({
      id: quiz.id,
      title: quiz.title,
      status: quiz.status,
      createdAt: quiz.createdAt,
      publishedAt: quiz.publishedAt,
    })
    .from(quiz)
    .where(and(eq(quiz.authorId, authorId), isNull(quiz.deletedAt)))
    .orderBy(desc(quiz.createdAt));
}
