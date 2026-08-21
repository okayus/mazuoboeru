import { describe, expect, it } from "vitest";
import { groupTags, itemsWithAllTags, relatedTagCounts } from "./related-tags";

// Four published quizzes; ids are opaque strings (tag ids in the real system).
const items = [
  { id: "q1", tagIds: ["js", "security"] },
  { id: "q2", tagIds: ["js", "react"] },
  { id: "q3", tagIds: ["js", "react", "security"] },
  { id: "q4", tagIds: ["linux"] },
];

describe("groupTags", () => {
  it("groups (item, tag) rows into items, collapsing duplicate pairs and keeping first-seen order", () => {
    const rows = [
      { itemId: "q2", tagId: "js" },
      { itemId: "q1", tagId: "js" },
      { itemId: "q2", tagId: "react" },
      { itemId: "q2", tagId: "js" },
    ];
    expect(groupTags(rows)).toEqual([
      { id: "q2", tagIds: ["js", "react"] },
      { id: "q1", tagIds: ["js"] },
    ]);
  });

  it("returns no items for no rows", () => {
    expect(groupTags([])).toEqual([]);
  });
});

describe("itemsWithAllTags", () => {
  it("matches every item for an empty selection", () => {
    expect(itemsWithAllTags(items, []).map((i) => i.id)).toEqual(["q1", "q2", "q3", "q4"]);
  });

  it("matches items carrying the single selected tag", () => {
    expect(itemsWithAllTags(items, ["react"]).map((i) => i.id)).toEqual(["q2", "q3"]);
  });

  it("is an AND across several selected tags", () => {
    expect(itemsWithAllTags(items, ["js", "security"]).map((i) => i.id)).toEqual(["q1", "q3"]);
    expect(itemsWithAllTags(items, ["react", "security"]).map((i) => i.id)).toEqual(["q3"]);
  });

  it("matches nothing when any selected tag is unknown", () => {
    expect(itemsWithAllTags(items, ["js", "nope"])).toEqual([]);
  });

  it("treats a repeated selected tag as one", () => {
    expect(itemsWithAllTags(items, ["js", "js"]).map((i) => i.id)).toEqual(["q1", "q2", "q3"]);
  });
});

describe("relatedTagCounts", () => {
  it("yields every tag's item count (popularity) for an empty selection, count desc then id asc", () => {
    expect(relatedTagCounts(items, [])).toEqual([
      { tagId: "js", count: 3 },
      { tagId: "react", count: 2 },
      { tagId: "security", count: 2 },
      { tagId: "linux", count: 1 },
    ]);
  });

  it("counts co-tags over the matching items and excludes the selection itself", () => {
    expect(relatedTagCounts(items, ["js"])).toEqual([
      { tagId: "react", count: 2 },
      { tagId: "security", count: 2 },
    ]);
  });

  it("narrows further with an AND selection (pairwise co-occurrence alone could not tell this)", () => {
    // react∧security match only q3 — so "js" is related once, not twice as the (js,react) and
    // (js,security) pair counts would each suggest.
    expect(relatedTagCounts(items, ["react", "security"])).toEqual([{ tagId: "js", count: 1 }]);
  });

  it("is empty when the selection matches nothing or the matches carry no other tags", () => {
    expect(relatedTagCounts(items, ["nope"])).toEqual([]);
    expect(relatedTagCounts(items, ["linux"])).toEqual([]);
  });

  it("counts a tag once per item even if an item lists it twice", () => {
    expect(relatedTagCounts([{ id: "x", tagIds: ["a", "a", "b"] }], ["b"])).toEqual([
      { tagId: "a", count: 1 },
    ]);
  });
});
