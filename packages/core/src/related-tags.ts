// Related Tags (CONTEXT.md) — pure functions over an incidence list of "tagged items"
// (item → tag ids). No I/O. Tags are flat and know nothing about each other (ADR-0016):
// every relation here is DERIVED from items that carry tags together, at read time.
//
// Callers must pass ONLY published, non-deleted quizzes. Drafts and hidden quizzes also
// have quiz_tags rows, and a count is an existence signal — filtering is the boundary's
// job, these functions trust their input.
//
// Shared by the worker (timeline `?tags=` + `related`) and the SPA (tag-exploration graph),
// so the same selection produces the same Related Tags on both sides.

export type TaggedItem = { id: string; tagIds: readonly string[] };
export type TagCount = { tagId: string; count: number };

// Group flat (itemId, tagId) rows into tagged items. Item order = first appearance;
// duplicate (item, tag) pairs collapse. Items without any row are absent (they carry no
// tags, so they contribute nothing to any count).
export function groupTags(rows: readonly { itemId: string; tagId: string }[]): TaggedItem[] {
  const byItem = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = byItem.get(r.itemId) ?? new Set<string>();
    set.add(r.tagId);
    byItem.set(r.itemId, set);
  }
  return [...byItem].map(([id, tags]) => ({ id, tagIds: [...tags] }));
}

// Items carrying EVERY selected tag (AND). An empty selection matches all items.
export function itemsWithAllTags<T extends TaggedItem>(
  items: readonly T[],
  selectedTagIds: readonly string[],
): T[] {
  if (selectedTagIds.length === 0) return [...items];
  const selected = [...new Set(selectedTagIds)];
  return items.filter((it) => {
    const have = new Set(it.tagIds);
    return selected.every((id) => have.has(id));
  });
}

// Related Tags of a selection: among the items matching the selection (AND), how many
// carry each NON-selected tag. An empty selection yields every tag's item count — the
// popularity list. Sorted by count desc, then tagId asc, so output is deterministic.
export function relatedTagCounts(
  items: readonly TaggedItem[],
  selectedTagIds: readonly string[],
): TagCount[] {
  const selected = new Set(selectedTagIds);
  const counts = new Map<string, number>();
  for (const it of itemsWithAllTags(items, selectedTagIds)) {
    for (const id of new Set(it.tagIds)) {
      if (selected.has(id)) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([tagId, count]) => ({ tagId, count }))
    .sort((a, b) => b.count - a.count || compare(a.tagId, b.tagId));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
