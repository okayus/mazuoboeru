// Pure publish-gate validation (ADR-0002). A draft may be incomplete, but the
// irreversible draft->published transition must guarantee the quiz is gradeable:
// non-empty title, >=1 question, and per type — mcq needs >=2 choices with the right
// correct-count, short needs >=1 non-empty accepted answer (ADR-0012). No I/O here — the
// route loads the rows and calls this. Returns a list of error codes (empty = publishable).

export type QuestionShape = {
  type: "mcq_single" | "mcq_multi" | "short";
  // mcq only (empty for short).
  choices: ReadonlyArray<{ isCorrect: boolean }>;
  // short only (the author's raw accepted answers; empty/absent for mcq).
  acceptedAnswers?: readonly string[];
};

export type PublishCheckInput = {
  title: string;
  questions: ReadonlyArray<QuestionShape>;
};

export type PublishErrorCode =
  | "title_required"
  | "at_least_one_question"
  | "question_needs_two_choices"
  | "single_needs_exactly_one_correct"
  | "multi_needs_at_least_one_correct"
  | "short_needs_answer";

export type PublishError = {
  code: PublishErrorCode;
  questionIndex?: number;
};

export function validateForPublish(quiz: PublishCheckInput): PublishError[] {
  const errors: PublishError[] = [];

  if (quiz.title.trim().length === 0) errors.push({ code: "title_required" });
  if (quiz.questions.length === 0) errors.push({ code: "at_least_one_question" });

  quiz.questions.forEach((q, i) => {
    if (q.type === "short") {
      const hasAnswer = (q.acceptedAnswers ?? []).some((a) => a.trim().length > 0);
      if (!hasAnswer) errors.push({ code: "short_needs_answer", questionIndex: i });
      return;
    }
    if (q.choices.length < 2) {
      errors.push({ code: "question_needs_two_choices", questionIndex: i });
    }
    const correct = q.choices.filter((c) => c.isCorrect).length;
    if (q.type === "mcq_single" && correct !== 1) {
      errors.push({ code: "single_needs_exactly_one_correct", questionIndex: i });
    }
    if (q.type === "mcq_multi" && correct < 1) {
      errors.push({ code: "multi_needs_at_least_one_correct", questionIndex: i });
    }
  });

  return errors;
}
