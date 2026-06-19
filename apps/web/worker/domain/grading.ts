// Strict server-side grading (the only authority — the client never sees correct
// answers before this runs). A submission is correct iff the set of selected
// choice ids equals the set of correct choice ids exactly: no missing, no extra,
// no partial credit. An empty selection is incorrect. Duplicate ids are tolerated
// (de-duplicated). This single rule covers both mcq_single (exactly one correct,
// enforced at publish) and mcq_multi. See docs/features.md / ADR-0002.

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

// A question with its choices' correctness — the minimal input the grader needs. Shared by
// the attempt path (decideAnswer wraps this with attempt bookkeeping) and the Drill path
// (which calls gradeQuestion directly — no attempt, ADR-0008). This is the single place
// "is this selection valid, and is it correct?" is decided (server-authoritative — ADR-0010).
export type GradedQuestion = {
  id: string;
  choices: ReadonlyArray<{ id: string; isCorrect: boolean }>;
};

// Validate a selection against a question, then grade it. Pure. `unknown_question` when the
// question wasn't resolved (e.g. not part of a published quiz — the boundary decides that),
// `invalid_choice` when a selected id doesn't belong to the question, else `graded` with the
// boolean result + the correct ids (revealed only after grading).
export type QuestionGrade =
  | { kind: "unknown_question" }
  | { kind: "invalid_choice" }
  | { kind: "graded"; isCorrect: boolean; correctChoiceIds: string[] };

export function gradeQuestion(
  question: GradedQuestion | undefined,
  selectedChoiceIds: readonly string[],
): QuestionGrade {
  if (!question) return { kind: "unknown_question" };
  const validIds = new Set(question.choices.map((ch) => ch.id));
  if (selectedChoiceIds.some((id) => !validIds.has(id))) {
    return { kind: "invalid_choice" };
  }
  const correctChoiceIds = question.choices.filter((ch) => ch.isCorrect).map((ch) => ch.id);
  return {
    kind: "graded",
    isCorrect: gradeSelection(correctChoiceIds, selectedChoiceIds),
    correctChoiceIds,
  };
}
