// Pure diff-apply planner for editing a PUBLISHED quiz (ADR-0014). The client sends the
// full desired content; this function diffs it against the quiz's current active
// questions and emits a plan:
//   - payload question WITH an id  -> in-place update (same row — answer/review_list FKs
//     keep pointing at it). A type change is rejected (retire + add a new question instead).
//   - payload question WITHOUT id  -> insert (adding questions post-publish).
//   - existing id ABSENT from the payload -> retire (irreversible active->retired; never
//     a physical DELETE — answered questions are referenced by NO ACTION FKs).
//   - unknown / duplicate payload id -> problem (rejected; a typo'd id must not silently
//     become "retire the real one + insert a copy").
// Array order = the new position. Questions whose content AND position are unchanged are
// skipped entirely (keeps the D1 batch small for the common fix-one-question edit).
// No I/O here — the route loads rows, calls this, and hands the plan to the db layer.

export type QuestionTypeName = "mcq_single" | "mcq_multi" | "short";

export type EditChoice = { text: string; isCorrect: boolean };

export type ExistingQuestion = {
  id: string;
  type: QuestionTypeName;
  prompt: string;
  explanation: string | null;
  // Raw accepted answers (short); [] for mcq.
  answer: string[];
  // In position order.
  choices: EditChoice[];
  position: number;
};

export type EditQuestionInput = {
  id?: string | undefined;
  type: QuestionTypeName;
  prompt: string;
  explanation: string | null;
  answer: string[];
  choices: EditChoice[];
};

export type PlannedUpdate = {
  id: string;
  position: number;
  type: QuestionTypeName;
  prompt: string;
  explanation: string | null;
  answer: string[];
  choices: EditChoice[];
};

export type PlannedInsert = {
  position: number;
  type: QuestionTypeName;
  prompt: string;
  explanation: string | null;
  answer: string[];
  choices: EditChoice[];
};

export type EditPlan = {
  updates: PlannedUpdate[];
  inserts: PlannedInsert[];
  retireIds: string[];
  unchangedIds: string[];
};

export type EditProblem =
  | { kind: "unknown_question_id"; id: string }
  | { kind: "duplicate_question_id"; id: string }
  | { kind: "type_change"; id: string; from: QuestionTypeName; to: QuestionTypeName };

export type EditPlanResult = { ok: true; plan: EditPlan } | { ok: false; problems: EditProblem[] };

function sameChoices(a: readonly EditChoice[], b: readonly EditChoice[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((ch, i) => ch.text === b[i]!.text && ch.isCorrect === b[i]!.isCorrect);
}

function sameAnswers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

export function planPublishedEdit(
  existing: readonly ExistingQuestion[],
  payload: readonly EditQuestionInput[],
): EditPlanResult {
  const byId = new Map(existing.map((q) => [q.id, q]));
  const problems: EditProblem[] = [];
  const seen = new Set<string>();

  payload.forEach((qn) => {
    if (qn.id === undefined) return;
    if (seen.has(qn.id)) {
      problems.push({ kind: "duplicate_question_id", id: qn.id });
      return;
    }
    seen.add(qn.id);
    const ex = byId.get(qn.id);
    if (!ex) {
      problems.push({ kind: "unknown_question_id", id: qn.id });
      return;
    }
    if (ex.type !== qn.type) {
      problems.push({ kind: "type_change", id: qn.id, from: ex.type, to: qn.type });
    }
  });
  if (problems.length > 0) return { ok: false, problems };

  const updates: PlannedUpdate[] = [];
  const inserts: PlannedInsert[] = [];
  const unchangedIds: string[] = [];

  payload.forEach((qn, position) => {
    if (qn.id === undefined) {
      inserts.push({
        position,
        type: qn.type,
        prompt: qn.prompt,
        explanation: qn.explanation,
        answer: qn.answer,
        choices: qn.choices,
      });
      return;
    }
    const ex = byId.get(qn.id)!;
    const contentSame =
      ex.prompt === qn.prompt &&
      ex.explanation === qn.explanation &&
      sameAnswers(ex.answer, qn.answer) &&
      sameChoices(ex.choices, qn.choices);
    if (contentSame && ex.position === position) {
      unchangedIds.push(qn.id);
      return;
    }
    updates.push({
      id: qn.id,
      position,
      type: qn.type,
      prompt: qn.prompt,
      explanation: qn.explanation,
      answer: qn.answer,
      choices: qn.choices,
    });
  });

  const retireIds = existing.filter((q) => !seen.has(q.id)).map((q) => q.id);

  return { ok: true, plan: { updates, inserts, retireIds, unchangedIds } };
}
