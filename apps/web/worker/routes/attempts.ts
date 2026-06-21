import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireUser } from "../auth/middleware";
import {
  createAttempt,
  finalizeAttempt,
  findUnfinishedAttempt,
  getAttempt,
  listAttemptAnswers,
  recordAnswer,
  userQuestionStats,
} from "../db/attempt-queries";
import { loadPublishedQuiz, type PublicQuiz } from "../db/public-queries";
import type { LoadedQuestion } from "../db/quiz-queries";
import { reviewListIdsAmong } from "../db/review-list-queries";
import type { Attempt } from "../db/schema";
import { decideAnswer, type GradedQuestion, type Submission } from "../domain/attempt-grading";
import { MAX_ANSWER_LEN } from "../domain/short-answer";
import { apiError } from "../http/errors";
import { parseStoredText, parseStringArray } from "../lib/json";
import { publicQuizJson } from "../presenters/quiz";
import type { Bindings, Env } from "../types";

const startSchema = z.object({ quizId: z.string().min(1) });
// One submission shape covers both kinds: mcq sends choiceIds, short sends text. Which the
// question actually expects is decided server-side by gradeQuestion (type_mismatch otherwise).
const answerSchema = z.object({
  questionId: z.string().min(1),
  choiceIds: z.array(z.string().min(1)).max(20).optional(),
  text: z.string().max(MAX_ANSWER_LEN).optional(),
});

// Read the submission shape: text wins when present (short), else a choice selection (mcq).
function submissionOf(data: {
  choiceIds?: string[] | undefined;
  text?: string | undefined;
}): Submission {
  return data.text !== undefined
    ? { kind: "text", text: data.text }
    : { kind: "selection", choiceIds: data.choiceIds ?? [] };
}

// Project the loaded question down to just what the grader needs (drops choice text/position;
// short carries its accepted answers). The answer key never leaves the server until grading.
function toGradedQuestion(q: LoadedQuestion | undefined): GradedQuestion | undefined {
  if (!q) return undefined;
  if (q.type === "short") return { id: q.id, type: "short", accept: q.answer };
  return {
    id: q.id,
    type: q.type,
    choices: q.choices.map((ch) => ({ id: ch.id, isCorrect: ch.isCorrect })),
  };
}

type AttemptJson = {
  id: string;
  finished: boolean;
  score: number | null;
  total: number | null;
  startedAt: number;
};

function attemptJson(att: Attempt): AttemptJson {
  return {
    id: att.id,
    finished: att.finishedAt !== null,
    score: att.score,
    total: att.total,
    startedAt: att.startedAt,
  };
}

// Type-aware so the client renders a resumed/answered question the same way it grades it.
type AnswerDetail =
  | {
      questionId: string;
      type: "mcq_single" | "mcq_multi";
      isCorrect: boolean;
      selectedChoiceIds: string[];
      correctChoiceIds: string[];
      explanation: string | null;
    }
  | {
      questionId: string;
      type: "short";
      isCorrect: boolean;
      submittedText: string;
      acceptedAnswers: string[];
      explanation: string | null;
    };

// Render already-submitted answers (for resume / review). These questions are
// answered, so revealing the answer key (correct ids / accepted answers) + explanation is fine.
async function buildAnswerDetails(
  env: Bindings,
  attemptId: string,
  found: PublicQuiz,
): Promise<AnswerDetail[]> {
  const rows = await listAttemptAnswers(env, attemptId);
  const byId = new Map(found.loaded.questions.map((q) => [q.id, q]));
  return rows.map((r): AnswerDetail => {
    const q = byId.get(r.questionId);
    if (q && q.type === "short") {
      return {
        questionId: r.questionId,
        type: "short",
        isCorrect: r.isCorrect === 1,
        submittedText: parseStoredText(r.response),
        acceptedAnswers: q.answer,
        explanation: q.explanation,
      };
    }
    return {
      questionId: r.questionId,
      type: q && q.type !== "short" ? q.type : "mcq_single",
      isCorrect: r.isCorrect === 1,
      selectedChoiceIds: parseStringArray(r.response),
      correctChoiceIds: q ? q.choices.filter((c) => c.isCorrect).map((c) => c.id) : [],
      explanation: q?.explanation ?? null,
    };
  });
}

export const attemptsRouter = new Hono<Env>()
  .use("*", requireAuth)

  // Start or resume an attempt at a published quiz.
  .post("/", async (c) => {
    const user = requireUser(c);
    const body = (await c.req.json().catch(() => null)) as unknown;
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) return c.json(apiError("invalid_body"), 400);

    const found = await loadPublishedQuiz(c.env, parsed.data.quizId);
    if (!found) return c.json(apiError("not_found"), 404);

    const existing = await findUnfinishedAttempt(c.env, user.id, parsed.data.quizId);
    const att = existing ?? (await createAttempt(c.env, user.id, parsed.data.quizId));
    const answers = await buildAnswerDetails(c.env, att.id, found);
    const questionIds = found.loaded.questions.map((q) => q.id);
    const reviewListQuestionIds = await reviewListIdsAmong(c.env, user.id, questionIds);
    const questionStats = await userQuestionStats(c.env, user.id, questionIds);
    return c.json({
      attempt: attemptJson(att),
      quiz: publicQuizJson(found.loaded, found.authorDisplayName),
      answers,
      reviewListQuestionIds,
      questionStats,
    });
  })

  // Get an attempt's state (own only).
  .get("/:attemptId", async (c) => {
    const user = requireUser(c);
    const att = await getAttempt(c.env, c.req.param("attemptId"));
    if (!att || att.userId !== user.id) return c.json(apiError("not_found"), 404);
    const found = await loadPublishedQuiz(c.env, att.quizId);
    if (!found) return c.json(apiError("quiz_unavailable"), 409);
    const answers = await buildAnswerDetails(c.env, att.id, found);
    const questionIds = found.loaded.questions.map((q) => q.id);
    const reviewListQuestionIds = await reviewListIdsAmong(c.env, user.id, questionIds);
    const questionStats = await userQuestionStats(c.env, user.id, questionIds);
    return c.json({
      attempt: attemptJson(att),
      quiz: publicQuizJson(found.loaded, found.authorDisplayName),
      answers,
      reviewListQuestionIds,
      questionStats,
    });
  })

  // Submit one answer → server grades → immediate feedback (correct ids + explanation).
  // The accept/reject + grade + finalize decision is the pure decideAnswer(); this
  // handler only loads rows and performs the writes (ADR-0010: server-authoritative
  // grading for single-source-of-truth + immediate feedback).
  .post("/:attemptId/answers", async (c) => {
    const user = requireUser(c);
    const att = await getAttempt(c.env, c.req.param("attemptId"));
    if (!att || att.userId !== user.id) return c.json(apiError("not_found"), 404);
    if (att.finishedAt !== null) return c.json(apiError("attempt_finished"), 409);

    const body = (await c.req.json().catch(() => null)) as unknown;
    const parsed = answerSchema.safeParse(body);
    if (!parsed.success) return c.json(apiError("invalid_body"), 400);

    const found = await loadPublishedQuiz(c.env, att.quizId);
    if (!found) return c.json(apiError("quiz_unavailable"), 409);

    const question = found.loaded.questions.find((q) => q.id === parsed.data.questionId);
    const submission = submissionOf(parsed.data);
    const prior = await listAttemptAnswers(c.env, att.id);
    const decision = decideAnswer({
      question: toGradedQuestion(question),
      submission,
      prior: prior.map((a) => ({ questionId: a.questionId, isCorrect: a.isCorrect === 1 })),
      totalQuestions: found.loaded.questions.length,
    });

    if (decision.kind === "unknown_question") return c.json(apiError("unknown_question"), 400);
    if (decision.kind === "type_mismatch") return c.json(apiError("wrong_answer_type"), 400);
    if (decision.kind === "invalid_choice") return c.json(apiError("invalid_choice"), 400);
    if (decision.kind === "already_answered") return c.json(apiError("already_answered"), 409);

    await recordAnswer(c.env, {
      attemptId: att.id,
      questionId: parsed.data.questionId,
      response:
        submission.kind === "text"
          ? JSON.stringify(submission.text)
          : JSON.stringify(submission.choiceIds),
      isCorrect: decision.isCorrect,
    });
    if (decision.finished && decision.score !== null) {
      await finalizeAttempt(c.env, att.id, decision.score, decision.total);
    }

    return c.json({
      isCorrect: decision.isCorrect,
      reveal: decision.reveal,
      explanation: question?.explanation ?? null,
      finished: decision.finished,
      score: decision.score,
      total: decision.total,
    });
  });
