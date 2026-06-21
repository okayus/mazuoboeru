import { describe, expect, it } from "vitest";
import { type GradedQuestion, gradeQuestion, gradeSelection } from "./grading";

const sel = (choiceIds: string[]) => ({ kind: "selection" as const, choiceIds });
const txt = (text: string) => ({ kind: "text" as const, text });

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

describe("gradeQuestion — mcq (validate + grade, shared core)", () => {
  const q: GradedQuestion = {
    id: "q1",
    type: "mcq_multi",
    choices: [
      { id: "a", isCorrect: true },
      { id: "b", isCorrect: false },
      { id: "c", isCorrect: true },
    ],
  };

  it("undefined question → unknown_question", () => {
    expect(gradeQuestion(undefined, sel(["a"])).kind).toBe("unknown_question");
  });

  it("a selected id not on the question → invalid_choice", () => {
    expect(gradeQuestion(q, sel(["a", "zzz"])).kind).toBe("invalid_choice");
  });

  it("a text submission to an mcq question → type_mismatch", () => {
    expect(gradeQuestion(q, txt("a")).kind).toBe("type_mismatch");
  });

  it("correct multi selection → graded isCorrect=true, reveal lists every correct id", () => {
    const g = gradeQuestion(q, sel(["c", "a"]));
    expect(g).toMatchObject({ kind: "graded", isCorrect: true });
    if (g.kind === "graded" && g.reveal.type !== "short") {
      expect([...g.reveal.correctChoiceIds].sort()).toEqual(["a", "c"]);
    }
  });

  it("incomplete multi selection → graded isCorrect=false (no partial credit)", () => {
    expect(gradeQuestion(q, sel(["a"]))).toMatchObject({ kind: "graded", isCorrect: false });
  });

  it("empty selection → graded isCorrect=false", () => {
    expect(gradeQuestion(q, sel([]))).toMatchObject({ kind: "graded", isCorrect: false });
  });
});

describe("gradeQuestion — short (normalize + accepted-list match)", () => {
  const q: GradedQuestion = { id: "s1", type: "short", accept: ["nsproxy", "struct nsproxy"] };

  it("a normalized match → graded isCorrect=true, reveal carries accepted answers", () => {
    const g = gradeQuestion(q, txt(" NSProxy "));
    expect(g).toMatchObject({ kind: "graded", isCorrect: true });
    if (g.kind === "graded" && g.reveal.type === "short") {
      expect(g.reveal.acceptedAnswers).toEqual(["nsproxy", "struct nsproxy"]);
    }
  });

  it("a non-match → graded isCorrect=false", () => {
    expect(gradeQuestion(q, txt("task_struct"))).toMatchObject({
      kind: "graded",
      isCorrect: false,
    });
  });

  it("a selection submission to a short question → type_mismatch", () => {
    expect(gradeQuestion(q, sel(["x"])).kind).toBe("type_mismatch");
  });
});
