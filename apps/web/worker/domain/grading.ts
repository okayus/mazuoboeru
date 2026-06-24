// Strict server-side grading (the only authority — the client never sees the answer key
// before this runs). Two question shapes, one decision point:
//   - mcq_single / mcq_multi: a submission is correct iff the set of selected choice ids
//     equals the set of correct choice ids exactly (no missing, no extra, no partial credit;
//     empty selection is incorrect; duplicate ids tolerated). Covers single (exactly one
//     correct, enforced at publish) and multi.
//   - short: a typed answer is correct iff it matches an Accepted Answer after Answer
//     Normalization (see ./short-answer; ADR-0012).
// Shared by the quiz-scoped 挑戦 and the Review List Drill — both call this directly
// (stateless, append-only; ADR-0008/0013). See docs/features.md / ADR-0002 / ADR-0010.

import { gradeShortAnswer } from "./short-answer";

export function gradeSelection(
  correctChoiceIds: readonly string[],
  selectedChoiceIds: readonly string[],
): boolean {
  if (selectedChoiceIds.length === 0) return false;
  const correct = new Set(correctChoiceIds);
  const selected = new Set(selectedChoiceIds);
  if (selected.size !== correct.size) return false;
  for (const id of selected) {
    if (!correct.has(id)) return false;
  }
  return true;
}

// A question with the minimal data the grader needs, discriminated by type. mcq carries its
// choices' correctness; short carries its raw accepted answers (used only server-side).
export type GradedQuestion =
  | {
      id: string;
      type: "mcq_single" | "mcq_multi";
      choices: ReadonlyArray<{ id: string; isCorrect: boolean }>;
    }
  | { id: string; type: "short"; accept: readonly string[] };

// What the challenger submitted, discriminated to mirror the question shapes.
export type Submission =
  | { kind: "selection"; choiceIds: readonly string[] }
  | { kind: "text"; text: string };

// The answer key, revealed only AFTER grading (immediate feedback). mcq → the correct choice
// ids (for highlighting); short → the accepted answers (acceptedAnswers[0] is the canonical
// form shown as "正解").
export type AnswerReveal =
  | { type: "mcq_single" | "mcq_multi"; correctChoiceIds: string[] }
  | { type: "short"; acceptedAnswers: string[] };

// Validate a submission against a question, then grade it. Pure. `unknown_question` when the
// question wasn't resolved (e.g. not part of a published quiz — the boundary decides that),
// `type_mismatch` when the submission shape doesn't fit the question type, `invalid_choice`
// when a selected id doesn't belong to the question, else `graded` with the boolean result +
// the reveal.
export type QuestionGrade =
  | { kind: "unknown_question" }
  | { kind: "type_mismatch" }
  | { kind: "invalid_choice" }
  | { kind: "graded"; isCorrect: boolean; reveal: AnswerReveal };

export function gradeQuestion(
  question: GradedQuestion | undefined,
  submission: Submission,
): QuestionGrade {
  if (!question) return { kind: "unknown_question" };

  if (question.type === "short") {
    if (submission.kind !== "text") return { kind: "type_mismatch" };
    return {
      kind: "graded",
      isCorrect: gradeShortAnswer(question.accept, submission.text),
      reveal: { type: "short", acceptedAnswers: [...question.accept] },
    };
  }

  if (submission.kind !== "selection") return { kind: "type_mismatch" };
  const validIds = new Set(question.choices.map((ch) => ch.id));
  if (submission.choiceIds.some((id) => !validIds.has(id))) {
    return { kind: "invalid_choice" };
  }
  const correctChoiceIds = question.choices.filter((ch) => ch.isCorrect).map((ch) => ch.id);
  return {
    kind: "graded",
    isCorrect: gradeSelection(correctChoiceIds, submission.choiceIds),
    reveal: { type: question.type, correctChoiceIds },
  };
}
