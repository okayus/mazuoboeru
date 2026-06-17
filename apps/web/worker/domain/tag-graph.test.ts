import { describe, expect, it } from "vitest";
import {
  ancestorIds,
  childIds,
  descendantIds,
  type Edge,
  parentIds,
  wouldCreateCycle,
} from "./tag-graph";

// js ⊂ prog, js ⊂ dyn, dyn ⊂ prog, prog ⊂ cs  (multi-parent + diamond js→{prog,dyn}→...→cs)
const edges: Edge[] = [
  { narrowerId: "js", broaderId: "prog" },
  { narrowerId: "js", broaderId: "dyn" },
  { narrowerId: "dyn", broaderId: "prog" },
  { narrowerId: "prog", broaderId: "cs" },
];

describe("ancestorIds (effective broader)", () => {
  it("collects all ancestors transitively over multiple parents, deduped", () => {
    expect(ancestorIds(edges, ["js"])).toEqual(new Set(["prog", "dyn", "cs"]));
  });
  it("excludes the seed itself", () => {
    expect(ancestorIds(edges, ["prog"])).toEqual(new Set(["cs"]));
  });
  it("unions across multiple seeds", () => {
    expect(ancestorIds(edges, ["dyn", "prog"])).toEqual(new Set(["prog", "cs"]));
  });
  it("is empty for a root tag", () => {
    expect(ancestorIds(edges, ["cs"])).toEqual(new Set());
  });
});

describe("descendantIds (broad-tag filter)", () => {
  it("collects all descendants transitively", () => {
    expect(descendantIds(edges, "cs")).toEqual(new Set(["prog", "dyn", "js"]));
    expect(descendantIds(edges, "prog")).toEqual(new Set(["dyn", "js"]));
  });
  it("is empty for a leaf tag", () => {
    expect(descendantIds(edges, "js")).toEqual(new Set());
  });
});

describe("parentIds / childIds (immediate, for drill chips)", () => {
  it("parentIds = immediate broader", () => {
    expect(new Set(parentIds(edges, "js"))).toEqual(new Set(["prog", "dyn"]));
  });
  it("childIds = immediate narrower", () => {
    expect(new Set(childIds(edges, "prog"))).toEqual(new Set(["dyn", "js"]));
  });
});

describe("wouldCreateCycle", () => {
  it("rejects a self-edge", () => {
    expect(wouldCreateCycle(edges, "js", "js")).toBe(true);
  });
  it("rejects an edge that would close a cycle (cs ⊂ js, but js ⊂* cs already)", () => {
    expect(wouldCreateCycle(edges, "cs", "js")).toBe(true);
  });
  it("allows a safe new edge (ts ⊂ prog)", () => {
    expect(wouldCreateCycle(edges, "ts", "prog")).toBe(false);
  });
});
