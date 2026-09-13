import { describe, expect, it } from "vitest";
import {
  correctAnswerTexts,
  type ResultEntry,
  submittedAnswerTexts,
  summarizeChallenge,
} from "./challenge-result";

// Choices deliberately listed OUT of position order (the card shuffles them per mount): the
// result screen must show answers in the author's order regardless of how they were shown.
const mcq = (
  questionId: string,
  isCorrect: boolean,
  chosen: string[],
  correct: string[],
  type: "mcq_single" | "mcq_multi" = "mcq_single",
): ResultEntry => ({
  item: {
    questionId,
    type,
    prompt: `Q ${questionId}`,
    choices: [
      { id: "c", text: "Bad Request", position: 2 },
      { id: "a", text: "Not Found", position: 0 },
      { id: "b", text: "Forbidden", position: 1 },
    ],
  },
  feedback: {
    type,
    isCorrect,
    explanation: null,
    chosenChoiceIds: chosen,
    correctChoiceIds: correct,
  },
});

const short = (questionId: string, isCorrect: boolean, typed: string): ResultEntry => ({
  item: { questionId, type: "short", prompt: `Q ${questionId}`, choices: [] },
  feedback: {
    type: "short",
    isCorrect,
    explanation: "解説",
    submittedText: typed,
    acceptedAnswers: ["nsproxy", "struct nsproxy"],
  },
});

describe("summarizeChallenge", () => {
  it("groups wrong first, keeps presentation order inside each group, counts and rounds", () => {
    const entries = [
      mcq("q1", true, ["a"], ["a"]),
      short("q2", false, "nsproxi"),
      mcq("q3", false, ["b"], ["a"]),
    ];
    const s = summarizeChallenge(entries);
    expect(s.correct).toBe(1);
    expect(s.total).toBe(3);
    expect(s.percent).toBe(33);
    expect(s.wrong.map((e) => e.item.questionId)).toEqual(["q2", "q3"]);
    expect(s.right.map((e) => e.item.questionId)).toEqual(["q1"]);
  });

  it("is 0 / 0 (0%) for an empty pass rather than NaN", () => {
    expect(summarizeChallenge([])).toEqual({
      correct: 0,
      total: 0,
      percent: 0,
      wrong: [],
      right: [],
    });
  });

  it("rounds 2/3 up to 67%", () => {
    const s = summarizeChallenge([
      mcq("q1", true, ["a"], ["a"]),
      mcq("q2", true, ["a"], ["a"]),
      mcq("q3", false, ["b"], ["a"]),
    ]);
    expect(s.percent).toBe(67);
  });
});

describe("correctAnswerTexts / submittedAnswerTexts", () => {
  it("mcq: resolves ids to texts in the author's position order (not display order)", () => {
    const e = mcq("q", false, ["c", "a"], ["b", "a"], "mcq_multi");
    expect(correctAnswerTexts(e)).toEqual(["Not Found", "Forbidden"]);
    expect(submittedAnswerTexts(e)).toEqual(["Not Found", "Bad Request"]);
  });

  it("mcq: ignores ids that are not among the question's choices", () => {
    const e = mcq("q", false, ["zzz"], ["a"]);
    expect(correctAnswerTexts(e)).toEqual(["Not Found"]);
    expect(submittedAnswerTexts(e)).toEqual([]);
  });

  it("short: 正解 is the accepted list (canonical first), あなたの答え is the text as typed", () => {
    const e = short("q", false, " NSProxy ");
    expect(correctAnswerTexts(e)).toEqual(["nsproxy", "struct nsproxy"]);
    expect(submittedAnswerTexts(e)).toEqual([" NSProxy "]);
  });
});
