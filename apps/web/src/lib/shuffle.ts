// Pure Fisher–Yates shuffle. The RNG is injected so the permutation is deterministic
// under test; the boundary (a React useState initializer) supplies Math.random().
//
// Used to randomize MCQ choice DISPLAY order on every presentation, so a learner can't
// memorize "the answer is the 3rd option" (位置依存の暗記を断つ — the point of まず覚える).
// This is DISPLAY-ONLY and intentionally so:
//   - `choice.position` stays the authored/canonical order (the server keeps returning it);
//   - the shuffled order is never persisted (it lives only in component state for one mount);
//   - grading is order-independent — a set match on choice ids (gradeSelection / ADR-0010),
//     so shuffling can never change a verdict.
// Limitation (no opt-out by design): a choice whose TEXT references another by position
// (e.g. "2と4の両方") breaks under shuffle — authors should avoid that (docs/features.md).
// "上記すべて"-style options are fine: still graded by id wherever they land.
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    // i ∈ [1, len-1] and j ∈ [0, i] are both valid indices; the ! satisfies
    // noUncheckedIndexedAccess (Fisher–Yates guarantees no undefined here).
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
