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
