import { describe, expect, it } from "vitest";
import { relatedTagCounts } from "./related-tags";
import { cooccurrenceEdges, tagGraph } from "./tag-graph";

// Same fixture as related-tags.test.ts: four published quizzes.
const items = [
  { id: "q1", tagIds: ["js", "security"] },
  { id: "q2", tagIds: ["js", "react"] },
  { id: "q3", tagIds: ["js", "react", "security"] },
  { id: "q4", tagIds: ["linux"] },
];

describe("cooccurrenceEdges", () => {
  it("counts, per unordered pair, the items carrying both tags (a < b; count desc, then a, b)", () => {
    expect(cooccurrenceEdges(items)).toEqual([
      { a: "js", b: "react", count: 2 },
      { a: "js", b: "security", count: 2 },
      { a: "react", b: "security", count: 1 },
    ]);
  });

  it("orders each pair canonically whatever the item's tag order, and counts an item once", () => {
    expect(cooccurrenceEdges([{ id: "x", tagIds: ["b", "a", "a"] }])).toEqual([
      { a: "a", b: "b", count: 1 },
    ]);
  });

  it("has no edges for single-tag items or no items", () => {
    expect(cooccurrenceEdges([{ id: "x", tagIds: ["solo"] }])).toEqual([]);
    expect(cooccurrenceEdges([])).toEqual([]);
  });
});

describe("tagGraph", () => {
  it("is the whole graph for an empty selection: every tag (popularity) and every co-occurrence", () => {
    expect(tagGraph(items, [])).toEqual({
      nodes: [
        { tagId: "js", count: 3 },
        { tagId: "react", count: 2 },
        { tagId: "security", count: 2 },
        { tagId: "linux", count: 1 },
      ],
      edges: cooccurrenceEdges(items),
    });
  });

  it("keeps only the tags on matching items; the selected tag is a node sized by the match", () => {
    expect(tagGraph(items, ["js"])).toEqual({
      nodes: [
        { tagId: "js", count: 3 },
        { tagId: "react", count: 2 },
        { tagId: "security", count: 2 },
      ],
      edges: [
        { a: "js", b: "react", count: 2 },
        { a: "js", b: "security", count: 2 },
        { a: "react", b: "security", count: 1 },
      ],
    });
  });

  it("narrows with AND: edges are co-occurrences among the matching items only", () => {
    expect(tagGraph(items, ["react", "security"])).toEqual({
      nodes: [
        { tagId: "js", count: 1 },
        { tagId: "react", count: 1 },
        { tagId: "security", count: 1 },
      ],
      edges: [
        { a: "js", b: "react", count: 1 },
        { a: "js", b: "security", count: 1 },
        { a: "react", b: "security", count: 1 },
      ],
    });
  });

  it("is empty when the selection matches nothing", () => {
    expect(tagGraph(items, ["nope"])).toEqual({ nodes: [], edges: [] });
    expect(tagGraph(items, ["js", "linux"])).toEqual({ nodes: [], edges: [] });
  });

  it("agrees with Related Tags: its non-selected nodes are relatedTagCounts of the selection", () => {
    for (const selected of [[], ["js"], ["react"], ["react", "security"], ["linux"]]) {
      const sel = new Set(selected);
      expect(tagGraph(items, selected).nodes.filter((n) => !sel.has(n.tagId))).toEqual(
        relatedTagCounts(items, selected),
      );
    }
  });
});
