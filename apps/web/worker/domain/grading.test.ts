import { describe, expect, it } from "vitest";
import { gradeSelection } from "./grading";

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
