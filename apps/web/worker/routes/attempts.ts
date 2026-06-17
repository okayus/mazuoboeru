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
import { isFavorited } from "../db/favorite-queries";
import { loadPublishedQuiz, type PublicQuiz } from "../db/public-queries";
import type { Attempt } from "../db/schema";
import { gradeSelection } from "../domain/grading";
import { publicQuizJson } from "../presenters/quiz";
import type { Bindings, Env } from "../types";

const startSchema = z.object({ quizId: z.string().min(1) });
const answerSchema = z.object({
  questionId: z.string().min(1),
  choiceIds: z.array(z.string().min(1)).max(20),
});

function attemptJson(att: Attempt) {
  return {
    id: att.id,
    finished: att.finishedAt !== null,
    score: att.score,
    total: att.total,
    startedAt: att.startedAt,
  };
}

function parseResponse(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

type AnswerDetail = {
  questionId: string;
  selectedChoiceIds: string[];
  isCorrect: boolean;
  correctChoiceIds: string[];
  explanation: string | null;
};

// Render already-submitted answers (for resume / review). These questions are
// answered, so revealing correct ids + explanation is fine.
async function buildAnswerDetails(
  env: Bindings,
  attemptId: string,
  found: PublicQuiz,
): Promise<AnswerDetail[]> {
  const rows = await listAttemptAnswers(env, attemptId);
  const byId = new Map(found.loaded.questions.map((q) => [q.id, q]));
  return rows.map((r) => {
    const q = byId.get(r.questionId);
    return {
      questionId: r.questionId,
      selectedChoiceIds: parseResponse(r.response),
      isCorrect: r.isCorrect === 1,
      correctChoiceIds: q ? q.choices.filter((c) => c.isCorrect).map((c) => c.id) : [],
      explanation: q?.explanation ?? null,
    };
  });
}

export const attemptsRouter = new Hono<Env>();
attemptsRouter.use("*", requireAuth);

// Start or resume an attempt at a published quiz.
attemptsRouter.post("/", async (c) => {
  const user = requireUser(c);
  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);

  const found = await loadPublishedQuiz(c.env, parsed.data.quizId);
  if (!found) return c.json({ error: "not_found" }, 404);

  const existing = await findUnfinishedAttempt(c.env, user.id, parsed.data.quizId);
  const att = existing ?? (await createAttempt(c.env, user.id, parsed.data.quizId));
  const answers = await buildAnswerDetails(c.env, att.id, found);
  const favorited = await isFavorited(c.env, user.id, parsed.data.quizId);
  const questionStats = await userQuestionStats(
    c.env,
    user.id,
    found.loaded.questions.map((q) => q.id),
  );
  return c.json({
    attempt: attemptJson(att),
    quiz: publicQuizJson(found.loaded, found.authorDisplayName),
    answers,
    favorited,
    questionStats,
  });
});

// Get an attempt's state (own only).
attemptsRouter.get("/:attemptId", async (c) => {
  const user = requireUser(c);
  const att = await getAttempt(c.env, c.req.param("attemptId"));
  if (!att || att.userId !== user.id) return c.json({ error: "not_found" }, 404);
  const found = await loadPublishedQuiz(c.env, att.quizId);
  if (!found) return c.json({ error: "quiz_unavailable" }, 409);
  const answers = await buildAnswerDetails(c.env, att.id, found);
  const favorited = await isFavorited(c.env, user.id, att.quizId);
  const questionStats = await userQuestionStats(
    c.env,
    user.id,
    found.loaded.questions.map((q) => q.id),
  );
  return c.json({
    attempt: attemptJson(att),
    quiz: publicQuizJson(found.loaded, found.authorDisplayName),
    answers,
    favorited,
    questionStats,
  });
});

// Submit one answer → server grades → immediate feedback (correct ids + explanation).
attemptsRouter.post("/:attemptId/answers", async (c) => {
  const user = requireUser(c);
  const att = await getAttempt(c.env, c.req.param("attemptId"));
  if (!att || att.userId !== user.id) return c.json({ error: "not_found" }, 404);
  if (att.finishedAt !== null) return c.json({ error: "attempt_finished" }, 409);

  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);

  const found = await loadPublishedQuiz(c.env, att.quizId);
  if (!found) return c.json({ error: "quiz_unavailable" }, 409);

  const question = found.loaded.questions.find((q) => q.id === parsed.data.questionId);
  if (!question) return c.json({ error: "unknown_question" }, 400);

  // Selected ids must belong to this question.
  const validIds = new Set(question.choices.map((ch) => ch.id));
  if (parsed.data.choiceIds.some((id) => !validIds.has(id))) {
    return c.json({ error: "invalid_choice" }, 400);
  }

  const prior = await listAttemptAnswers(c.env, att.id);
  if (prior.some((a) => a.questionId === question.id)) {
    return c.json({ error: "already_answered" }, 409);
  }

  const correctChoiceIds = question.choices.filter((ch) => ch.isCorrect).map((ch) => ch.id);
  const isCorrect = gradeSelection(correctChoiceIds, parsed.data.choiceIds);
  await recordAnswer(c.env, {
    attemptId: att.id,
    questionId: question.id,
    response: JSON.stringify(parsed.data.choiceIds),
    isCorrect,
  });

  // Finalize when every question has been answered.
  const total = found.loaded.questions.length;
  const answeredCount = prior.length + 1;
  let finished = false;
  let score: number | null = null;
  if (answeredCount >= total) {
    score = prior.filter((a) => a.isCorrect === 1).length + (isCorrect ? 1 : 0);
    await finalizeAttempt(c.env, att.id, score, total);
    finished = true;
  }

  return c.json({
    isCorrect,
    correctChoiceIds,
    explanation: question.explanation,
    finished,
    score,
    total,
  });
});
