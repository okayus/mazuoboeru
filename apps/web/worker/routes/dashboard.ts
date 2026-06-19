import { Hono } from "hono";
import { requireAuth, requireUser } from "../auth/middleware";
import {
  authoredTagIdsByQuiz,
  loadUserAnswerFacts,
  loadUserDrillFacts,
} from "../db/dashboard-queries";
import { loadTagEdges, tagNameMap } from "../db/tag-queries";
import { bundleTagAccuracy, computeStreak } from "../domain/dashboard";
import type { Env } from "../types";

// Private learning dashboard (session-only). Activity-framed, per-answer (ADR-0006);
// the numbers are the caller's own — never public. Reads existing attempt data + tags.
export const dashboardRouter = new Hono<Env>()
  .use("*", requireAuth)

  .get("/", async (c) => {
    const user = requireUser(c);
    // A drill answer is an answer: review_answer feeds overall / streak / per-tag uniformly
    // (ADR-0006 2026-06-19). quizzesAttempted stays an Attempt concept (drilling a question
    // isn't "attempting the quiz"), so it counts attempt facts only — see below.
    const [attemptFacts, drillFacts] = await Promise.all([
      loadUserAnswerFacts(c.env, user.id),
      loadUserDrillFacts(c.env, user.id),
    ]);
    const facts = [...attemptFacts, ...drillFacts];

    const total = facts.length;
    const correct = facts.filter((f) => f.isCorrect).length;
    const streak = computeStreak(
      facts.map((f) => f.answeredAt),
      Date.now(),
    );
    const quizIds = [...new Set(facts.map((f) => f.quizId))];

    const [authoredByQuiz, edges] = await Promise.all([
      authoredTagIdsByQuiz(c.env, quizIds),
      loadTagEdges(c.env),
    ]);
    const { byTagId, untagged } = bundleTagAccuracy(
      facts.map((f) => ({ isCorrect: f.isCorrect, quizId: f.quizId })),
      authoredByQuiz,
      edges,
    );
    const nameById = await tagNameMap(c.env, [...byTagId.keys()]);
    const tags = [...byTagId.entries()]
      .map(([id, b]) => ({ name: nameById.get(id) ?? "?", correct: b.correct, total: b.total }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    return c.json({
      overall: { correct, total },
      streak,
      tags,
      untagged,
      quizzesAttempted: new Set(attemptFacts.map((f) => f.quizId)).size,
    });
  });
