import { Hono } from "hono";
import { requireAuth, requireUser } from "../auth/middleware";
import {
  authoredTagIdsByQuiz,
  loadUserAnswerFacts,
  quizTitlesByIds,
} from "../db/dashboard-queries";
import { loadTagEdges, tagNameMap } from "../db/tag-queries";
import { bundleQuizAccuracy, bundleTagAccuracy, computeStreak } from "../domain/dashboard";
import type { Env } from "../types";

// Private learning dashboard (session-only). Activity-framed, per-answer (ADR-0006); the numbers
// are the caller's own — never public. One read of the single flat `answer` table (ADR-0013) feeds
// every axis: overall / streak / per-tag / per-quiz. The former Attempt entity is gone, so there is
// no "completed" distinction — every Answer counts (the source is now uniform).
export const dashboardRouter = new Hono<Env>()
  .use("*", requireAuth)

  .get("/", async (c) => {
    const user = requireUser(c);
    const facts = await loadUserAnswerFacts(c.env, user.id);

    const total = facts.length;
    const correct = facts.filter((f) => f.isCorrect).length;
    const streak = computeStreak(
      facts.map((f) => f.answeredAt),
      Date.now(),
    );
    const quizIds = [...new Set(facts.map((f) => f.quizId))];

    const [authoredByQuiz, edges, titleById] = await Promise.all([
      authoredTagIdsByQuiz(c.env, quizIds),
      loadTagEdges(c.env),
      quizTitlesByIds(c.env, quizIds),
    ]);

    const answerFacts = facts.map((f) => ({ isCorrect: f.isCorrect, quizId: f.quizId }));
    const { byTagId, untagged } = bundleTagAccuracy(answerFacts, authoredByQuiz, edges);
    const nameById = await tagNameMap(c.env, [...byTagId.keys()]);
    const tags = [...byTagId.entries()]
      .map(([id, b]) => ({ name: nameById.get(id) ?? "?", correct: b.correct, total: b.total }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    // Per-quiz axis (ADR-0013): group answers by their quiz (question->quiz), most-answered first.
    const quizzes = [...bundleQuizAccuracy(answerFacts).entries()]
      .map(([quizId, b]) => ({
        quizId,
        quizTitle: titleById.get(quizId) ?? "（削除済みのクイズ）",
        correct: b.correct,
        total: b.total,
      }))
      .sort((a, b) => b.total - a.total || a.quizTitle.localeCompare(b.quizTitle));

    return c.json({ overall: { correct, total }, streak, tags, untagged, quizzes });
  });
