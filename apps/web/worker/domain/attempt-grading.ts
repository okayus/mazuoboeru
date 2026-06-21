// Pure decision for submitting one answer to an attempt (no I/O). The route loads the
// published quiz + prior answers, calls this to decide accept/reject + grade + finalize, then
// performs the writes. Extracted from routes/attempts.ts so the wiring (validity,
// already-answered idempotency, finalize-when-complete, score aggregation) is unit-testable.
// The validate-and-grade core lives in gradeQuestion (./grading) and is shared with the Drill
// path (ADR-0008) — grading correctness is single-sourced (ADR-0010: server-authoritative for
// single-source-of-truth + immediate feedback, not competitive anti-cheat).

import { type AnswerReveal, type GradedQuestion, gradeQuestion, type Submission } from "./grading";

// Re-exported so importers (routes, tests) resolve these from here too.
export type { AnswerReveal, GradedQuestion, Submission };

export type AnswerInput = {
  // The question being answered, resolved from the quiz — undefined if the submitted
  // questionId is not part of this (published) quiz.
  question: GradedQuestion | undefined;
  // What the user submitted (choice ids for mcq, text for short).
  submission: Submission;
  // Answers already recorded in this attempt (correctness normalized to boolean).
  prior: ReadonlyArray<{ questionId: string; isCorrect: boolean }>;
  // Total questions in the quiz (drives finalize).
  totalQuestions: number;
};

// Discriminated union: a submission is rejected for one specific reason, or accepted with the
// graded result. The route maps each `kind` to an HTTP status/error code.
export type AnswerDecision =
  | { kind: "unknown_question" }
  | { kind: "type_mismatch" }
  | { kind: "invalid_choice" }
  | { kind: "already_answered" }
  | {
      kind: "accepted";
      isCorrect: boolean;
      reveal: AnswerReveal;
      finished: boolean;
      score: number | null; // set only when finished, else null
      total: number;
    };

export function decideAnswer(input: AnswerInput): AnswerDecision {
  const { question, submission, prior, totalQuestions } = input;

  // Shared core: validate + grade (single source of correctness — the same call Drill uses;
  // ADR-0010). unknown_question / type_mismatch / invalid_choice pass straight through.
  const graded = gradeQuestion(question, submission);
  if (graded.kind !== "graded") return graded;

  // Attempt-only bookkeeping below (Drill skips this — stateless, append-only; ADR-0008). One
  // graded submission per question per attempt (idempotency guard). `question` is defined
  // whenever grading succeeded; the guard also narrows the type.
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
    reveal: graded.reveal,
    finished,
    score,
    total: totalQuestions,
  };
}
