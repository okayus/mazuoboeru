import { describe, expect, it } from "vitest";
import { type GradedQuestion, gradeQuestion, gradeSelection } from "./grading";

describe("gradeSelection (strict set equality)", () => {
  it("single correct: exact match is correct", () => {
    expect(gradeSelection(["a"], ["a"])).toBe(true);
  });

  it("single correct: wrong choice is incorrect", () => {
    expect(gradeSelection(["a"], ["b"])).toBe(false);
  });

  it("empty selection is always incorrect", () => {
    expect(gradeSelection(["a"], [])).toBe(false);
    expect(gradeSelection(["a", "b"], [])).toBe(false);
  });

  it("multi: exact set match (order-independent) is correct", () => {
    expect(gradeSelection(["a", "b"], ["b", "a"])).toBe(true);
  });

  it("multi: missing a correct choice is incorrect (no partial credit)", () => {
    expect(gradeSelection(["a", "b"], ["a"])).toBe(false);
  });

  it("multi: an extra (wrong) choice is incorrect", () => {
    expect(gradeSelection(["a", "b"], ["a", "b", "c"])).toBe(false);
  });

  it("tolerates duplicate selections", () => {
    expect(gradeSelection(["a"], ["a", "a"])).toBe(true);
    expect(gradeSelection(["a", "b"], ["a", "a", "b"])).toBe(true);
  });

  it("selecting only one of several correct is incorrect", () => {
    expect(gradeSelection(["a", "b", "c"], ["a"])).toBe(false);
  });
});

describe("gradeQuestion (validate + grade, shared core)", () => {
  const q: GradedQuestion = {
    id: "q1",
    choices: [
      { id: "a", isCorrect: true },
      { id: "b", isCorrect: false },
      { id: "c", isCorrect: true },
    ],
  };

  it("undefined question → unknown_question", () => {
    expect(gradeQuestion(undefined, ["a"]).kind).toBe("unknown_question");
  });

  it("a selected id not on the question → invalid_choice", () => {
    expect(gradeQuestion(q, ["a", "zzz"]).kind).toBe("invalid_choice");
  });

  it("correct multi selection → graded isCorrect=true with all correct ids", () => {
    const g = gradeQuestion(q, ["c", "a"]);
    expect(g).toMatchObject({ kind: "graded", isCorrect: true });
    if (g.kind === "graded") expect([...g.correctChoiceIds].sort()).toEqual(["a", "c"]);
  });

  it("incomplete multi selection → graded isCorrect=false (no partial credit)", () => {
    expect(gradeQuestion(q, ["a"])).toMatchObject({ kind: "graded", isCorrect: false });
  });

  it("empty selection → graded isCorrect=false", () => {
    expect(gradeQuestion(q, [])).toMatchObject({ kind: "graded", isCorrect: false });
  });
});
