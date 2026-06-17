import { describe, expect, it } from "vitest";
import { type AnswerFact, bundleTagAccuracy, computeStreak } from "./dashboard";
import type { Edge } from "./tag-graph";

// ms at ~12:00 JST on JST-day index `d` (3:00 UTC), safely inside that day.
const dayMs = (d: number) => d * 86_400_000 + 3 * 3_600_000;

describe("computeStreak", () => {
  it("is zero with no answers", () => {
    expect(computeStreak([], dayMs(100))).toEqual({ current: 0, longest: 0 });
  });
  it("counts a single active day as 1/1", () => {
    expect(computeStreak([dayMs(100)], dayMs(100))).toEqual({ current: 1, longest: 1 });
  });
  it("collapses multiple answers on the same JST day", () => {
    expect(computeStreak([dayMs(100), dayMs(100), dayMs(100)], dayMs(100))).toEqual({
      current: 1,
      longest: 1,
    });
  });
  it("counts a consecutive run ending today", () => {
    expect(computeStreak([dayMs(98), dayMs(99), dayMs(100)], dayMs(100))).toEqual({
      current: 3,
      longest: 3,
    });
  });
  it("keeps the current streak alive if the last day was yesterday", () => {
    expect(computeStreak([dayMs(98), dayMs(99)], dayMs(100))).toEqual({ current: 2, longest: 2 });
  });
  it("drops the current streak when the last active day is older than yesterday", () => {
    expect(computeStreak([dayMs(90), dayMs(91), dayMs(92)], dayMs(100))).toEqual({
      current: 0,
      longest: 3,
    });
  });
  it("computes longest across a gap independent of current", () => {
    // run 90-91 (2), gap, run 95-96-97 (3); now=97 → current 3, longest 3
    expect(
      computeStreak([dayMs(90), dayMs(91), dayMs(95), dayMs(96), dayMs(97)], dayMs(97)),
    ).toEqual({ current: 3, longest: 3 });
  });
});

describe("bundleTagAccuracy", () => {
  const edges: Edge[] = [{ narrowerId: "js", broaderId: "prog" }];
  const authoredByQuiz = new Map<string, string[]>([
    ["qJs", ["js"]],
    ["qNone", []],
  ]);
  const answers: AnswerFact[] = [
    { isCorrect: true, quizId: "qJs" },
    { isCorrect: false, quizId: "qJs" },
    { isCorrect: true, quizId: "qNone" },
  ];

  it("rolls a narrow-tag answer up into its broader effective tags", () => {
    const { byTagId, untagged } = bundleTagAccuracy(answers, authoredByQuiz, edges);
    expect(byTagId.get("js")).toEqual({ correct: 1, total: 2 });
    expect(byTagId.get("prog")).toEqual({ correct: 1, total: 2 });
    expect(untagged).toEqual({ correct: 1, total: 1 });
  });

  it("puts answers on untagged quizzes into the untagged bucket only", () => {
    const { byTagId, untagged } = bundleTagAccuracy(
      [{ isCorrect: false, quizId: "qNone" }],
      authoredByQuiz,
      edges,
    );
    expect(byTagId.size).toBe(0);
    expect(untagged).toEqual({ correct: 0, total: 1 });
  });
});
