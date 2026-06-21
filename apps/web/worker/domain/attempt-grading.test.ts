import { describe, expect, it } from "vitest";
import { type AnswerInput, decideAnswer, type GradedQuestion } from "./attempt-grading";

// A 2-choice single-correct question (id "q1", correct = "a").
const q1: GradedQuestion = {
  id: "q1",
  type: "mcq_single",
  choices: [
    { id: "a", isCorrect: true },
    { id: "b", isCorrect: false },
  ],
};
// A multi-correct question (id "q2", correct = {a, c}).
const q2: GradedQuestion = {
  id: "q2",
  type: "mcq_multi",
  choices: [
    { id: "a", isCorrect: true },
    { id: "b", isCorrect: false },
    { id: "c", isCorrect: true },
  ],
};
// A short question (id "s1", accepts nsproxy).
const s1: GradedQuestion = { id: "s1", type: "short", accept: ["nsproxy"] };

const sel = (choiceIds: string[]) => ({ kind: "selection" as const, choiceIds });
const txt = (text: string) => ({ kind: "text" as const, text });

function input(over: Partial<AnswerInput>): AnswerInput {
  return {
    question: q1,
    submission: sel(["a"]),
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
    expect(decideAnswer(input({ submission: sel(["a", "zzz"]) })).kind).toBe("invalid_choice");
  });

  it("a text submission to an mcq question → type_mismatch", () => {
    expect(decideAnswer(input({ submission: txt("a") })).kind).toBe("type_mismatch");
  });

  it("the question already has an answer in this attempt → already_answered", () => {
    const d = decideAnswer(input({ prior: [{ questionId: "q1", isCorrect: true }] }));
    expect(d.kind).toBe("already_answered");
  });

  it("unknown_question takes precedence over an invalid choice", () => {
    expect(decideAnswer(input({ question: undefined, submission: sel(["zzz"]) })).kind).toBe(
      "unknown_question",
    );
  });

  it("invalid_choice takes precedence over already_answered (matches route order)", () => {
    const d = decideAnswer(
      input({ submission: sel(["zzz"]), prior: [{ questionId: "q1", isCorrect: true }] }),
    );
    expect(d.kind).toBe("invalid_choice");
  });
});

describe("decideAnswer — grading", () => {
  it("correct single selection grades isCorrect=true and reveals correct ids", () => {
    const d = decideAnswer(input({ submission: sel(["a"]) }));
    expect(d).toMatchObject({ kind: "accepted", isCorrect: true });
    if (d.kind === "accepted" && d.reveal.type !== "short") {
      expect(d.reveal.correctChoiceIds).toEqual(["a"]);
    }
  });

  it("wrong selection grades isCorrect=false but still accepted", () => {
    const d = decideAnswer(input({ submission: sel(["b"]) }));
    expect(d).toMatchObject({ kind: "accepted", isCorrect: false });
  });

  it("empty selection is incorrect (delegates to strict grading)", () => {
    const d = decideAnswer(input({ submission: sel([]) }));
    expect(d).toMatchObject({ kind: "accepted", isCorrect: false });
  });

  it("multi: exact set is correct; reveal lists every correct id", () => {
    const d = decideAnswer(input({ question: q2, submission: sel(["c", "a"]), totalQuestions: 2 }));
    expect(d).toMatchObject({ kind: "accepted", isCorrect: true });
    if (d.kind === "accepted" && d.reveal.type !== "short") {
      expect([...d.reveal.correctChoiceIds].sort()).toEqual(["a", "c"]);
    }
  });

  it("multi: missing one correct choice is incorrect (no partial credit)", () => {
    const d = decideAnswer(input({ question: q2, submission: sel(["a"]), totalQuestions: 2 }));
    expect(d).toMatchObject({ kind: "accepted", isCorrect: false });
  });

  it("short: a normalized text match is correct; reveal carries accepted answers", () => {
    const d = decideAnswer(input({ question: s1, submission: txt(" NSProxy ") }));
    expect(d).toMatchObject({ kind: "accepted", isCorrect: true });
    if (d.kind === "accepted" && d.reveal.type === "short") {
      expect(d.reveal.acceptedAnswers).toEqual(["nsproxy"]);
    }
  });

  it("short: a non-matching text is incorrect but accepted", () => {
    const d = decideAnswer(input({ question: s1, submission: txt("task_struct") }));
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
        submission: sel(["a"]),
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
        submission: sel(["b"]), // wrong
        totalQuestions: 2,
        prior: [{ questionId: "qx", isCorrect: true }],
      }),
    );
    expect(d).toMatchObject({ kind: "accepted", finished: true, isCorrect: false, score: 1 });
  });

  it("single-question quiz: first answer finalizes immediately", () => {
    const d = decideAnswer(input({ totalQuestions: 1, prior: [], submission: sel(["a"]) }));
    expect(d).toMatchObject({ kind: "accepted", finished: true, score: 1, total: 1 });
  });
});
