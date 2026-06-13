// Pure publish-gate validation (ADR-0002). A draft may be incomplete, but the
// irreversible draft->published transition must guarantee the quiz is gradeable:
// non-empty title, >=1 question, every question >=2 choices, mcq_single exactly
// one correct choice, mcq_multi at least one. No I/O here — the route loads the
// rows and calls this. Returns a list of error codes (empty = publishable).

export type QuestionShape = {
  type: "mcq_single" | "mcq_multi";
  choices: ReadonlyArray<{ isCorrect: boolean }>;
};

export type PublishCheckInput = {
  title: string;
  questions: ReadonlyArray<QuestionShape>;
};

export type PublishError = {
  code: string;
  questionIndex?: number;
};

export function validateForPublish(quiz: PublishCheckInput): PublishError[] {
  const errors: PublishError[] = [];

  if (quiz.title.trim().length === 0) errors.push({ code: "title_required" });
  if (quiz.questions.length === 0) errors.push({ code: "at_least_one_question" });

  quiz.questions.forEach((q, i) => {
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
