// Pure decision for submitting one answer to an attempt (no I/O). The route loads
// the published quiz + prior answers, calls this to decide accept/reject + grade +
// finalize, then performs the writes. Extracted from routes/attempts.ts so the
// wiring (choice-belongs-to-question, already-answered idempotency, finalize-when-
// complete, score aggregation) is unit-testable. The same path is reused by the
// Phase 3 Drill (ADR-0008), so its correctness is the feedback's correctness
// (ADR-0010: grading is server-authoritative for single-source-of-truth + immediate
// feedback, not competitive anti-cheat).

import { gradeSelection } from "./grading";

export type GradedQuestion = {
  id: string;
  choices: ReadonlyArray<{ id: string; isCorrect: boolean }>;
};

export type AnswerInput = {
  // The question being answered, resolved from the quiz — undefined if the submitted
  // questionId is not part of this (published) quiz.
  question: GradedQuestion | undefined;
  // Choice ids the user selected.
  selectedChoiceIds: readonly string[];
  // Answers already recorded in this attempt (correctness normalized to boolean).
  prior: ReadonlyArray<{ questionId: string; isCorrect: boolean }>;
  // Total questions in the quiz (drives finalize).
  totalQuestions: number;
};

// Discriminated union: a submission is rejected for one specific reason, or accepted
// with the graded result. The route maps each `kind` to an HTTP status/error code.
export type AnswerDecision =
  | { kind: "unknown_question" }
  | { kind: "invalid_choice" }
  | { kind: "already_answered" }
  | {
      kind: "accepted";
      isCorrect: boolean;
      correctChoiceIds: string[];
      finished: boolean;
      score: number | null; // set only when finished, else null
      total: number;
    };

export function decideAnswer(input: AnswerInput): AnswerDecision {
  const { question, selectedChoiceIds, prior, totalQuestions } = input;

  if (!question) return { kind: "unknown_question" };

  // Every selected id must belong to this question.
  const validIds = new Set(question.choices.map((ch) => ch.id));
  if (selectedChoiceIds.some((id) => !validIds.has(id))) {
    return { kind: "invalid_choice" };
  }

  // One graded submission per question per attempt (idempotency guard).
  if (prior.some((a) => a.questionId === question.id)) {
    return { kind: "already_answered" };
  }

  const correctChoiceIds = question.choices.filter((ch) => ch.isCorrect).map((ch) => ch.id);
  const isCorrect = gradeSelection(correctChoiceIds, selectedChoiceIds);

  // Finalize once every question has an answer; score is computed only then.
  const answeredCount = prior.length + 1;
  const finished = answeredCount >= totalQuestions;
  const score = finished
    ? prior.filter((a) => a.isCorrect).length + (isCorrect ? 1 : 0)
    : null;

  return { kind: "accepted", isCorrect, correctChoiceIds, finished, score, total: totalQuestions };
}
