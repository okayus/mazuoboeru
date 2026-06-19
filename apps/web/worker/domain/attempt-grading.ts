// Pure decision for submitting one answer to an attempt (no I/O). The route loads
// the published quiz + prior answers, calls this to decide accept/reject + grade +
// finalize, then performs the writes. Extracted from routes/attempts.ts so the
// wiring (choice-belongs-to-question, already-answered idempotency, finalize-when-
// complete, score aggregation) is unit-testable. The validate-and-grade core lives in
// gradeQuestion (./grading) and is shared with the Phase 3 Drill (ADR-0008) — so grading
// correctness is single-sourced (ADR-0010: server-authoritative for single-source-of-truth
// + immediate feedback, not competitive anti-cheat).

import { gradeQuestion, type GradedQuestion } from "./grading";

// Re-exported so existing importers (routes/attempts.ts, attempt-grading.test.ts) keep
// resolving GradedQuestion from here too.
export type { GradedQuestion };

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

  // Shared core: validate the selection + grade it (single source of correctness — the same
  // call the Drill path uses; ADR-0010). unknown_question / invalid_choice pass straight
  // through.
  const graded = gradeQuestion(question, selectedChoiceIds);
  if (graded.kind !== "graded") return graded;

  // Attempt-only bookkeeping below (the Drill path skips all of this — it is stateless,
  // append-only; ADR-0008). One graded submission per question per attempt (idempotency
  // guard). `question` is defined whenever grading succeeded; the guard also narrows the type.
  if (question && prior.some((a) => a.questionId === question.id)) {
    return { kind: "already_answered" };
  }

  // Finalize once every question has an answer; score is computed only then.
  const answeredCount = prior.length + 1;
  const finished = answeredCount >= totalQuestions;
  const score = finished
    ? prior.filter((a) => a.isCorrect).length + (graded.isCorrect ? 1 : 0)
    : null;

  return {
    kind: "accepted",
    isCorrect: graded.isCorrect,
    correctChoiceIds: graded.correctChoiceIds,
    finished,
    score,
    total: totalQuestions,
  };
}
