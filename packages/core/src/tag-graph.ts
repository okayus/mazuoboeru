// Tag Graph (CONTEXT.md) — the picture of Related Tags. Nodes are tags, sized by how many
// published quizzes carry them; an edge joins two tags authored together on at least one
// published quiz, weighted by how many. Nothing here is stored (ADR-0016): the graph is
// derived from the same incidence list the timeline's Related Tags come from, so selecting
// tags in the graph and narrowing the timeline with `?tags=` agree exactly.
//
// Same contract as related-tags.ts: callers pass ONLY published, non-deleted quizzes.

import { itemsWithAllTags, relatedTagCounts, type TagCount, type TaggedItem } from "./related-tags";

// An undirected edge; `a < b` (string order) so each pair has one canonical form.
export type TagEdge = { a: string; b: string; count: number };
export type TagGraph = { nodes: TagCount[]; edges: TagEdge[] };

// Co-occurrence: for every unordered pair of distinct tags, how many items carry both.
// A tag listed twice on one item still counts that item once. Sorted by count desc, then
// a asc, b asc, so output is deterministic.
export function cooccurrenceEdges(items: readonly TaggedItem[]): TagEdge[] {
  // a -> (b -> count), with a < b. Nested maps rather than a joined string key: tag ids
  // are opaque, so no delimiter can be assumed absent from them.
  const counts = new Map<string, Map<string, number>>();
  for (const it of items) {
    const tags = [...new Set(it.tagIds)].sort(compare);
    for (let i = 0; i < tags.length; i++) {
      const a = tags[i] as string;
      const row = counts.get(a) ?? new Map<string, number>();
      for (let j = i + 1; j < tags.length; j++) {
        const b = tags[j] as string;
        row.set(b, (row.get(b) ?? 0) + 1);
      }
      if (row.size) counts.set(a, row);
    }
  }
  const edges: TagEdge[] = [];
  for (const [a, row] of counts) for (const [b, count] of row) edges.push({ a, b, count });
  return edges.sort((x, y) => y.count - x.count || compare(x.a, y.a) || compare(x.b, y.b));
}

// The graph of a selection (AND, like everything else): nodes are every tag on the items
// matching the selection — the selected tags themselves included, each with the size of
// the match, so a view can draw them as the hubs they are — and edges are the
// co-occurrences among those items only. Tags on no matching item are simply absent ("the
// nodes that don't fit disappear"). The non-selected nodes are exactly
// relatedTagCounts(items, selected). An empty selection is the whole graph.
export function tagGraph(
  items: readonly TaggedItem[],
  selectedTagIds: readonly string[],
): TagGraph {
  const matching = itemsWithAllTags(items, selectedTagIds);
  return { nodes: relatedTagCounts(matching, []), edges: cooccurrenceEdges(matching) };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
