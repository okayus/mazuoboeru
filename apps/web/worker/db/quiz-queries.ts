import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { EditPlan } from "../domain/quiz-edit";
import { parseAcceptedAnswers, serializeAcceptedAnswers } from "../domain/short-answer";
import { newId } from "../lib/id";
import type { Bindings } from "../types";
import { db } from "./client";
import { choice, question, quiz, type Quiz } from "./schema";

export type QuizQuestionType = "mcq_single" | "mcq_multi" | "short";

export type QuizContentInput = {
  title: string;
  description: string | null;
  questions: Array<{
    type: QuizQuestionType;
    prompt: string;
    explanation: string | null;
    choices: Array<{ text: string; isCorrect: boolean }>;
    // Raw accepted answers for `short` (ADR-0012); empty for mcq.
    answer: string[];
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
  type: QuizQuestionType;
  prompt: string;
  explanation: string | null;
  position: number;
  choices: LoadedChoice[];
  // Raw accepted answers for `short` (parsed from question.answer); empty for mcq.
  answer: string[];
};
export type LoadedQuiz = { quiz: Quiz; questions: LoadedQuestion[] };

// Load a quiz with its ACTIVE questions and their choices (full fidelity, incl
// is_correct). retired questions are excluded — every caller here is presentation
// (author editor / public projection / publish + edit gates); history reads live in
// dashboard-queries and don't use this loader (ADR-0014). Callers decide what to
// expose — never send is_correct/explanation to a challenger before grading.
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
    .where(and(eq(question.quizId, quizId), eq(question.status, "active")))
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
    answer: parseAcceptedAnswers(r.answer),
  }));
  return { quiz: q, questions };
}

// D1 caps bound parameters at 100 PER STATEMENT (not per batch):
// https://developers.cloudflare.com/d1/platform/limits/. A multi-row INSERT of N
// rows binds N * (columns per row) params, so a quiz with enough questions/choices
// overflowed the cap as a single INSERT and D1 rejected the query (the route caught
// nothing and returned a bare 500). We split the rows into chunks that each stay
// within the cap; all chunks still go into one d.batch() (callers below), which
// remains atomic — D1 applies the limit per statement, not per batch.
const D1_MAX_BOUND_PARAMS = 100;
// Params bound per row = number of columns in each values() shape below — drizzle also
// binds schema-defaulted columns (status) it fills in client-side. Keep these in sync
// if a column is added to the question / choice insert.
const QUESTION_PARAMS_PER_ROW = 8; // id, quizId, type, prompt, explanation, answer, status, position
const CHOICE_PARAMS_PER_ROW = 5; // id, questionId, text, isCorrect, position
const QUESTION_ROWS_PER_STMT = Math.floor(D1_MAX_BOUND_PARAMS / QUESTION_PARAMS_PER_ROW); // 12
const CHOICE_ROWS_PER_STMT = Math.floor(D1_MAX_BOUND_PARAMS / CHOICE_PARAMS_PER_ROW); // 20

// Split rows into fixed-size, order-preserving chunks. chunk([], n) === [].
export function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// Build the INSERT statements for a quiz's questions + choices, chunked so each
// statement stays within D1's per-statement bound-param cap. Exported for unit tests.
export function contentStatements(
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
      // short stores its accepted answers as JSON; mcq has no answer key here (NULL).
      answer: qn.type === "short" ? serializeAcceptedAnswers(qn.answer) : null,
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
  for (const rows of chunk(questionRows, QUESTION_ROWS_PER_STMT)) {
    stmts.push(d.insert(question).values(rows));
  }
  for (const rows of chunk(choiceRows, CHOICE_ROWS_PER_STMT)) {
    stmts.push(d.insert(choice).values(rows));
  }
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
  // choice is NO ACTION on question (migration 0008), so delete choices explicitly before
  // their questions (same batch = atomic). No review_list rows can reference these: a draft's
  // questions aren't published, so nothing is in anyone's Review List yet.
  if (existingIds.length) {
    stmts.push(d.delete(choice).where(inArray(choice.questionId, existingIds)));
    stmts.push(d.delete(question).where(inArray(question.id, existingIds)));
  }
  for (const s of contentStatements(d, quizId, input)) stmts.push(s);
  await d.batch(stmts);
}

// UPDATE/DELETE statements that filter by an id list bind 1 param per id (plus the
// SET values), so cap the ids per statement below the 100-param limit with headroom.
const IDS_PER_STMT = 99;

// Build the batch statements for a published-quiz edit plan (ADR-0014). Updates are
// id-preserving (answer/review_list keep referencing the same question row); a
// question's choices are wholesale replaced (nothing holds an FK to choice — the
// grader reads them live). Retire is an UPDATE to status='retired', never a DELETE.
// Exported for the param-cap unit test (same rationale as contentStatements).
export function publishedEditStatements(
  d: ReturnType<typeof db>,
  quizId: string,
  plan: EditPlan,
): BatchItem<"sqlite">[] {
  const stmts: BatchItem<"sqlite">[] = [];

  for (const ids of chunk(plan.retireIds, IDS_PER_STMT)) {
    stmts.push(d.update(question).set({ status: "retired" }).where(inArray(question.id, ids)));
  }

  for (const u of plan.updates) {
    stmts.push(
      d
        .update(question)
        .set({
          prompt: u.prompt,
          explanation: u.explanation,
          answer: u.type === "short" ? serializeAcceptedAnswers(u.answer) : null,
          position: u.position,
        })
        .where(eq(question.id, u.id)),
    );
  }
  for (const ids of chunk(
    plan.updates.map((u) => u.id),
    IDS_PER_STMT,
  )) {
    stmts.push(d.delete(choice).where(inArray(choice.questionId, ids)));
  }

  const questionRows: Array<typeof question.$inferInsert> = [];
  const choiceRows: Array<typeof choice.$inferInsert> = [];
  for (const u of plan.updates) {
    u.choices.forEach((ch, ci) => {
      choiceRows.push({
        id: newId(),
        questionId: u.id,
        text: ch.text,
        isCorrect: ch.isCorrect ? 1 : 0,
        position: ci,
      });
    });
  }
  for (const ins of plan.inserts) {
    const qId = newId();
    questionRows.push({
      id: qId,
      quizId,
      type: ins.type,
      prompt: ins.prompt,
      explanation: ins.explanation,
      answer: ins.type === "short" ? serializeAcceptedAnswers(ins.answer) : null,
      position: ins.position,
    });
    ins.choices.forEach((ch, ci) => {
      choiceRows.push({
        id: newId(),
        questionId: qId,
        text: ch.text,
        isCorrect: ch.isCorrect ? 1 : 0,
        position: ci,
      });
    });
  }
  for (const rows of chunk(questionRows, QUESTION_ROWS_PER_STMT)) {
    stmts.push(d.insert(question).values(rows));
  }
  for (const rows of chunk(choiceRows, CHOICE_ROWS_PER_STMT)) {
    stmts.push(d.insert(choice).values(rows));
  }
  return stmts;
}

// Apply a published-quiz edit atomically: meta (title/description) + the diff plan
// in one D1 batch. Caller has verified ownership, run planPublishedEdit (no problems)
// and the edit gate (validateForPublish on the resulting active set) — ADR-0014.
export async function applyPublishedEdit(
  env: Bindings,
  quizId: string,
  meta: { title: string; description: string | null },
  plan: EditPlan,
): Promise<void> {
  const d = db(env);
  const stmts: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
    d
      .update(quiz)
      .set({ title: meta.title, description: meta.description, updatedAt: Date.now() })
      .where(eq(quiz.id, quizId)),
    ...publishedEditStatements(d, quizId, plan),
  ];
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
