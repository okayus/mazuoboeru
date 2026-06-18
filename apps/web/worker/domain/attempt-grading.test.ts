import { describe, expect, it } from "vitest";
import { type AnswerInput, decideAnswer, type GradedQuestion } from "./attempt-grading";

// A 2-choice single-correct question (id "q1", correct = "a").
const q1: GradedQuestion = {
  id: "q1",
  choices: [
    { id: "a", isCorrect: true },
    { id: "b", isCorrect: false },
  ],
};
// A multi-correct question (id "q2", correct = {a, c}).
const q2: GradedQuestion = {
  id: "q2",
  choices: [
    { id: "a", isCorrect: true },
    { id: "b", isCorrect: false },
    { id: "c", isCorrect: true },
  ],
};

function input(over: Partial<AnswerInput>): AnswerInput {
  return {
    question: q1,
    selectedChoiceIds: ["a"],
    prior: [],
    totalQuestions: 1,
    ...over,
  };
}

describe("decideAnswer — rejections", () => {
  it("unknown question id → unknown_question", () => {
    expect(decideAnswer(input({ question: undefined })).kind).toBe("unknown_question");
  });

  it("a selected id not belonging to the question → invalid_choice", () => {
    expect(decideAnswer(input({ selectedChoiceIds: ["a", "zzz"] })).kind).toBe("invalid_choice");
  });

  it("the question already has an answer in this attempt → already_answered", () => {
    const d = decideAnswer(input({ prior: [{ questionId: "q1", isCorrect: true }] }));
    expect(d.kind).toBe("already_answered");
  });

  it("unknown_question takes precedence over an invalid choice", () => {
    // question undefined: the choice can't even be validated.
    expect(decideAnswer(input({ question: undefined, selectedChoiceIds: ["zzz"] })).kind).toBe(
      "unknown_question",
    );
  });

  it("invalid_choice takes precedence over already_answered (matches route order)", () => {
    const d = decideAnswer(
      input({ selectedChoiceIds: ["zzz"], prior: [{ questionId: "q1", isCorrect: true }] }),
    );
    expect(d.kind).toBe("invalid_choice");
  });
});

describe("decideAnswer — grading", () => {
  it("correct single selection grades isCorrect=true and exposes correct ids", () => {
    const d = decideAnswer(input({ selectedChoiceIds: ["a"] }));
    expect(d).toMatchObject({ kind: "accepted", isCorrect: true, correctChoiceIds: ["a"] });
  });

  it("wrong selection grades isCorrect=false but still accepted", () => {
    const d = decideAnswer(input({ selectedChoiceIds: ["b"] }));
    expect(d).toMatchObject({ kind: "accepted", isCorrect: false });
  });

  it("empty selection is incorrect (delegates to strict grading)", () => {
    const d = decideAnswer(input({ selectedChoiceIds: [] }));
    expect(d).toMatchObject({ kind: "accepted", isCorrect: false });
  });

  it("multi: exact set is correct; correctChoiceIds lists every correct id", () => {
    const d = decideAnswer(
      input({ question: q2, selectedChoiceIds: ["c", "a"], totalQuestions: 2 }),
    );
    expect(d).toMatchObject({ kind: "accepted", isCorrect: true });
    if (d.kind === "accepted") expect([...d.correctChoiceIds].sort()).toEqual(["a", "c"]);
  });

  it("multi: missing one correct choice is incorrect (no partial credit)", () => {
    const d = decideAnswer(input({ question: q2, selectedChoiceIds: ["a"], totalQuestions: 2 }));
    expect(d).toMatchObject({ kind: "accepted", isCorrect: false });
  });
});

describe("decideAnswer — finalize & score", () => {
  it("not the last question: finished=false, score=null", () => {
    const d = decideAnswer(input({ totalQuestions: 3, prior: [] }));
    expect(d).toMatchObject({ kind: "accepted", finished: false, score: null, total: 3 });
  });

  it("last question: finalizes and aggregates prior correct + this answer", () => {
    // 2 prior (1 correct, 1 wrong) + this correct = score 2 of 3.
    const d = decideAnswer(
      input({
        selectedChoiceIds: ["a"],
        totalQuestions: 3,
        prior: [
          { questionId: "qx", isCorrect: true },
          { questionId: "qy", isCorrect: false },
        ],
      }),
    );
    expect(d).toMatchObject({ kind: "accepted", finished: true, score: 2, total: 3 });
  });

  it("last question answered wrong: score counts prior correct only", () => {
    const d = decideAnswer(
      input({
        selectedChoiceIds: ["b"], // wrong
        totalQuestions: 2,
        prior: [{ questionId: "qx", isCorrect: true }],
      }),
    );
    expect(d).toMatchObject({ kind: "accepted", finished: true, isCorrect: false, score: 1 });
  });

  it("single-question quiz: first answer finalizes immediately", () => {
    const d = decideAnswer(input({ totalQuestions: 1, prior: [], selectedChoiceIds: ["a"] }));
    expect(d).toMatchObject({ kind: "accepted", finished: true, score: 1, total: 1 });
  });
});
