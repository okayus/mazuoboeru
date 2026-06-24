import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireUser } from "../auth/middleware";
import {
  loadDrillPool,
  loadGradedQuestion,
  loadQuizDrillPool,
  recordReviewAnswer,
  userQuestionStats,
} from "../db/drill-queries";
import { reviewListIdsAmong } from "../db/review-list-queries";
import { gradeQuestion, type Submission } from "../domain/grading";
import { MAX_ANSWER_LEN } from "../domain/short-answer";
import { apiError } from "../http/errors";
import type { Env } from "../types";

const answerSchema = z.object({
  questionId: z.string().min(1),
  choiceIds: z.array(z.string().min(1)).max(20).optional(),
  text: z.string().max(MAX_ANSWER_LEN).optional(),
});

// Drill (session-only, private — CONTEXT.md Drill; ADR-0008/0013). Two pools: the Review List
// (GET /) and one whole quiz (GET /quiz/:quizId — the "挑戦" entry, ADR-0013). Stateless: each
// GET returns the whole pool (whole-pool fetch); the client walks it one question at a time and
// POSTs each answer; the server only grades + appends an Answer — no attempt / score / completion.
// Review List graduating ("覚えた") reuses DELETE /review-list/:questionId; "まだ" (keep) is a
// client-side no-op. Method-chained for hc<AppType> inference (ADR-0011).
export const drillRouter = new Hono<Env>()
  .use("*", requireAuth)

  // The whole drill pool (currently-published questions only), newest first, plus the
  // caller's own per-question accuracy (attempt + drill answers — ADR-0006). Never is_correct.
  .get("/", async (c) => {
    const user = requireUser(c);
    const items = await loadDrillPool(c.env, user.id);
    const questionStats = await userQuestionStats(
      c.env,
      user.id,
      items.map((i) => i.questionId),
    );
    return c.json({ items, questionStats });
  })

  // The quiz-scoped Drill pool — every question of one published quiz (the "挑戦" entry point;
  // ADR-0013) in author position order (the client shuffles per mount), plus the caller's
  // per-question accuracy and which of these questions are already in their Review List (for the
  // ☆ toggle). Never is_correct. 404 when the quiz isn't currently published & not deleted.
  .get("/quiz/:quizId", async (c) => {
    const user = requireUser(c);
    const pool = await loadQuizDrillPool(c.env, c.req.param("quizId"));
    if (!pool) return c.json(apiError("not_found"), 404);
    const questionIds = pool.items.map((i) => i.questionId);
    const [questionStats, reviewListQuestionIds] = await Promise.all([
      userQuestionStats(c.env, user.id, questionIds),
      reviewListIdsAmong(c.env, user.id, questionIds),
    ]);
    return c.json({
      quizTitle: pool.quizTitle,
      items: pool.items,
      questionStats,
      reviewListQuestionIds,
    });
  })

  // Grade one drill answer → append review_answer → immediate feedback (correct ids +
  // explanation). No attempt is created (ADR-0008); grading is the shared pure gradeQuestion
  // (ADR-0010). 400 when the question isn't part of a currently published, non-deleted quiz.
  .post("/answers", async (c) => {
    const user = requireUser(c);
    const body = (await c.req.json().catch(() => null)) as unknown;
    const parsed = answerSchema.safeParse(body);
    if (!parsed.success) return c.json(apiError("invalid_body"), 400);

    const submission: Submission =
      parsed.data.text !== undefined
        ? { kind: "text", text: parsed.data.text }
        : { kind: "selection", choiceIds: parsed.data.choiceIds ?? [] };
    const loaded = await loadGradedQuestion(c.env, parsed.data.questionId);
    const graded = gradeQuestion(loaded?.question, submission);
    if (graded.kind === "unknown_question") return c.json(apiError("unknown_question"), 400);
    if (graded.kind === "type_mismatch") return c.json(apiError("wrong_answer_type"), 400);
    if (graded.kind === "invalid_choice") return c.json(apiError("invalid_choice"), 400);

    await recordReviewAnswer(c.env, {
      userId: user.id,
      questionId: parsed.data.questionId,
      isCorrect: graded.isCorrect,
    });

    return c.json({
      isCorrect: graded.isCorrect,
      reveal: graded.reveal,
      explanation: loaded?.explanation ?? null,
    });
  });
