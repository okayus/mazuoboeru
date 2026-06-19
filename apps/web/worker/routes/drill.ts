import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireUser } from "../auth/middleware";
import { userQuestionStats } from "../db/attempt-queries";
import { loadDrillPool, loadGradedQuestion, recordReviewAnswer } from "../db/drill-queries";
import { gradeQuestion } from "../domain/grading";
import { apiError } from "../http/errors";
import type { Env } from "../types";

const answerSchema = z.object({
  questionId: z.string().min(1),
  choiceIds: z.array(z.string().min(1)).max(20),
});

// Drill over the Review List pool (session-only, private — CONTEXT.md Drill; ADR-0008).
// Stateless: GET returns the whole pool (whole-pool fetch); the client walks it one question
// at a time and POSTs each answer; the server only grades + appends a review_answer — no
// attempt / score / completion. Graduating ("覚えた") reuses DELETE /review-list/:questionId;
// "まだ" (keep) is a client-side no-op. Method-chained for hc<AppType> inference (ADR-0011).
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

  // Grade one drill answer → append review_answer → immediate feedback (correct ids +
  // explanation). No attempt is created (ADR-0008); grading is the shared pure gradeQuestion
  // (ADR-0010). 400 when the question isn't part of a currently published, non-deleted quiz.
  .post("/answers", async (c) => {
    const user = requireUser(c);
    const body = (await c.req.json().catch(() => null)) as unknown;
    const parsed = answerSchema.safeParse(body);
    if (!parsed.success) return c.json(apiError("invalid_body"), 400);

    const loaded = await loadGradedQuestion(c.env, parsed.data.questionId);
    const graded = gradeQuestion(loaded?.question, parsed.data.choiceIds);
    if (graded.kind === "unknown_question") return c.json(apiError("unknown_question"), 400);
    if (graded.kind === "invalid_choice") return c.json(apiError("invalid_choice"), 400);

    await recordReviewAnswer(c.env, {
      userId: user.id,
      questionId: parsed.data.questionId,
      isCorrect: graded.isCorrect,
    });

    return c.json({
      isCorrect: graded.isCorrect,
      correctChoiceIds: graded.correctChoiceIds,
      explanation: loaded?.explanation ?? null,
    });
  });
