import { describe, expect, it } from "vitest";
import { type PublishCheckInput, validateForPublish } from "./quiz-validation";

const codes = (q: PublishCheckInput) => validateForPublish(q).map((e) => e.code);

describe("validateForPublish", () => {
  it("passes a well-formed single-answer quiz", () => {
    expect(
      validateForPublish({
        title: "Capitals",
        questions: [
          { type: "mcq_single", choices: [{ isCorrect: true }, { isCorrect: false }] },
        ],
      }),
    ).toEqual([]);
  });

  it("requires a non-empty title", () => {
    expect(
      codes({
        title: "   ",
        questions: [
          { type: "mcq_single", choices: [{ isCorrect: true }, { isCorrect: false }] },
        ],
      }),
    ).toContain("title_required");
  });

  it("requires at least one question", () => {
    expect(codes({ title: "T", questions: [] })).toContain("at_least_one_question");
  });

  it("requires at least two choices per question", () => {
    const errors = validateForPublish({
      title: "T",
      questions: [{ type: "mcq_single", choices: [{ isCorrect: true }] }],
    });
    expect(errors.find((e) => e.code === "question_needs_two_choices")?.questionIndex).toBe(0);
  });

  it("mcq_single needs exactly one correct choice", () => {
    expect(
      codes({
        title: "T",
        questions: [
          { type: "mcq_single", choices: [{ isCorrect: true }, { isCorrect: true }] },
        ],
      }),
    ).toContain("single_needs_exactly_one_correct");
    expect(
      codes({
        title: "T",
        questions: [
          { type: "mcq_single", choices: [{ isCorrect: false }, { isCorrect: false }] },
        ],
      }),
    ).toContain("single_needs_exactly_one_correct");
  });

  it("mcq_multi needs at least one correct choice", () => {
    expect(
      codes({
        title: "T",
        questions: [
          { type: "mcq_multi", choices: [{ isCorrect: false }, { isCorrect: false }] },
        ],
      }),
    ).toContain("multi_needs_at_least_one_correct");
    expect(
      validateForPublish({
        title: "T",
        questions: [
          {
            type: "mcq_multi",
            choices: [{ isCorrect: true }, { isCorrect: true }, { isCorrect: false }],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("reports the offending question index", () => {
    const errors = validateForPublish({
      title: "T",
      questions: [
        { type: "mcq_single", choices: [{ isCorrect: true }, { isCorrect: false }] },
        { type: "mcq_single", choices: [{ isCorrect: true }, { isCorrect: true }] },
      ],
    });
    expect(
      errors.some(
        (e) => e.code === "single_needs_exactly_one_correct" && e.questionIndex === 1,
      ),
    ).toBe(true);
  });
});
