// Pure functions over the tag subsumption DAG (ADR-0007). An edge { narrowerId,
// broaderId } means narrower ⊂ broader ("is-a"). No I/O — callers load the (small)
// edge set once and pass it in. A visited set guards every traversal, so even a
// (wrongly) cyclic stored graph terminates.

export type Edge = { narrowerId: string; broaderId: string };

function adjacency(edges: Edge[], from: "narrowerId" | "broaderId"): Map<string, string[]> {
  const to = from === "narrowerId" ? "broaderId" : "narrowerId";
  const m = new Map<string, string[]>();
  for (const e of edges) {
    const arr = m.get(e[from]) ?? [];
    arr.push(e[to]);
    m.set(e[from], arr);
  }
  return m;
}

function closure(adj: Map<string, string[]>, seeds: string[]): Set<string> {
  const out = new Set<string>();
  const stack = [...seeds];
  while (stack.length) {
    const id = stack.pop() as string;
    for (const next of adj.get(id) ?? []) {
      if (!out.has(next)) {
        out.add(next);
        stack.push(next);
      }
    }
  }
  return out;
}

// Upward closure: all broader (ancestor) tag ids reachable from the seeds, NOT
// including the seeds. A quiz's effective tags = authored ∪ ancestorIds(authored).
export function ancestorIds(edges: Edge[], seedIds: string[]): Set<string> {
  return closure(adjacency(edges, "narrowerId"), seedIds);
}

// Downward closure: all narrower (descendant) tag ids reachable from root, NOT
// including root. Filtering by a broad tag matches quizzes authored-tagged with the
// tag itself or any descendant.
export function descendantIds(edges: Edge[], rootId: string): Set<string> {
  return closure(adjacency(edges, "broaderId"), [rootId]);
}

// Immediate broader (parents) / narrower (children) of a tag — for drill-up/down chips.
export function parentIds(edges: Edge[], id: string): string[] {
  return edges.filter((e) => e.narrowerId === id).map((e) => e.broaderId);
}
export function childIds(edges: Edge[], id: string): string[] {
  return edges.filter((e) => e.broaderId === id).map((e) => e.narrowerId);
}

// Adding narrower → broader creates a cycle iff broader can already reach narrower
// going upward (narrower is already an ancestor of broader). Enforced at curation
// time to keep the graph acyclic.
export function wouldCreateCycle(edges: Edge[], narrowerId: string, broaderId: string): boolean {
  if (narrowerId === broaderId) return true;
  return ancestorIds(edges, [broaderId]).has(narrowerId);
}
