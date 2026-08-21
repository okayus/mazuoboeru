import { describe, expect, it } from "vitest";
import {
  approachViewBox,
  clampToBox,
  edgeOpacity,
  edgeWidth,
  fitViewBox,
  FULL_VIEW,
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  labelThreshold,
  MAX_RADIUS,
  MIN_RADIUS,
  MIN_VIEW_WIDTH,
  nodeRadius,
  reconcileNodes,
  seedPosition,
  viewScale,
} from "./tag-graph-layout";

describe("nodeRadius", () => {
  it("gives the biggest tag MAX_RADIUS and grows with the square root of the count", () => {
    expect(nodeRadius(16, 16)).toBe(MAX_RADIUS);
    expect(nodeRadius(1, 1)).toBe(MAX_RADIUS);
    // area ∝ count: a quarter of the max count is half the radius span.
    expect(nodeRadius(4, 16)).toBeCloseTo(MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) / 2);
    expect(nodeRadius(1, 16)).toBeGreaterThan(MIN_RADIUS);
  });

  it("falls back to MIN_RADIUS for an empty graph or a zero count", () => {
    expect(nodeRadius(0, 0)).toBe(MIN_RADIUS);
    expect(nodeRadius(0, 5)).toBe(MIN_RADIUS);
  });
});

describe("edgeWidth", () => {
  it("is positive and increases with the co-occurrence count", () => {
    expect(edgeWidth(1)).toBeGreaterThan(0);
    expect(edgeWidth(4)).toBeGreaterThan(edgeWidth(1));
    expect(edgeWidth(0)).toBe(edgeWidth(1));
  });
});

describe("edgeOpacity", () => {
  it("is faint for a single shared quiz, grows with the count, and is capped", () => {
    expect(edgeOpacity(1)).toBeCloseTo(0.18);
    expect(edgeOpacity(0)).toBe(edgeOpacity(1));
    expect(edgeOpacity(3)).toBeGreaterThan(edgeOpacity(2));
    expect(edgeOpacity(50)).toBe(0.85);
  });
});

describe("labelThreshold", () => {
  it("is 0 (label everything) when the nodes fit", () => {
    expect(labelThreshold([3, 1], 5)).toBe(0);
    expect(labelThreshold([], 5)).toBe(0);
  });

  it("is the maxLabels-th largest count otherwise, so ties at the cut all show", () => {
    expect(labelThreshold([5, 3, 3, 1], 2)).toBe(3);
    expect(labelThreshold([9, 8, 7, 6, 5], 3)).toBe(7);
  });

  it("labels nothing when no labels are allowed", () => {
    expect(labelThreshold([5, 3], 0)).toBe(Infinity);
  });
});

describe("seedPosition", () => {
  it("starts at the centre and spirals outward without repeating a spot", () => {
    expect(seedPosition(0)).toEqual({ x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 });
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const { x, y } = seedPosition(i);
      seen.add(`${x.toFixed(3)},${y.toFixed(3)}`);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(GRAPH_WIDTH);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(GRAPH_HEIGHT);
    }
    expect(seen.size).toBe(50);
  });
});

describe("clampToBox", () => {
  it("keeps the whole disc inside the box with the margin", () => {
    expect(clampToBox(-50, 10, 100)).toBe(14);
    expect(clampToBox(200, 10, 100)).toBe(86);
    expect(clampToBox(50, 10, 100)).toBe(50);
  });

  it("centres a disc wider than the box", () => {
    expect(clampToBox(0, 80, 100)).toBe(50);
  });
});

describe("reconcileNodes", () => {
  const a = { id: "a", name: "A", count: 2, r: 9, x: 10, y: 20, vx: 1, vy: -1 };
  const prev = new Map([["a", a]]);

  it("keeps a surviving node's position and velocity, refreshing its count and radius", () => {
    const [next] = reconcileNodes(prev, [{ id: "a", name: "A", count: 4 }]);
    expect(next).toMatchObject({ id: "a", count: 4, x: 10, y: 20, vx: 1, vy: -1 });
    expect(next?.r).toBe(MAX_RADIUS); // it is the only (hence biggest) node now
    expect(next).not.toBe(a); // fresh object — d3 mutates nodes in place
  });

  it("seeds a newcomer at its spiral slot with zero velocity", () => {
    const out = reconcileNodes(prev, [
      { id: "a", name: "A", count: 4 },
      { id: "b", name: "B", count: 1 },
    ]);
    expect(out[1]).toMatchObject({ id: "b", count: 1, vx: 0, vy: 0, ...seedPosition(1) });
    expect(out[1]?.r).toBeLessThan(out[0]?.r ?? 0);
  });

  it("drops nodes that are no longer present", () => {
    expect(reconcileNodes(prev, [])).toEqual([]);
  });
});

describe("fitViewBox", () => {
  const aspect = GRAPH_WIDTH / GRAPH_HEIGHT;

  it("is the full canvas for no nodes", () => {
    expect(fitViewBox([])).toEqual(FULL_VIEW);
  });

  it("zooms onto a small cluster, keeping the canvas aspect ratio and the minimum width", () => {
    const v = fitViewBox([
      { x: 300, y: 250, r: 10 },
      { x: 340, y: 270, r: 10 },
    ]);
    expect(v.w).toBe(MIN_VIEW_WIDTH);
    expect(v.w / v.h).toBeCloseTo(aspect);
    // centred on the cluster (x: 290..350 → 320)
    expect(v.x + v.w / 2).toBeCloseTo(320);
    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.y).toBeGreaterThanOrEqual(0);
  });

  it("never exceeds the canvas and never leaves it", () => {
    const v = fitViewBox([
      { x: 10, y: 10, r: 8 },
      { x: GRAPH_WIDTH - 10, y: GRAPH_HEIGHT - 10, r: 8 },
    ]);
    expect(v).toEqual(FULL_VIEW);
    const corner = fitViewBox([{ x: 12, y: 12, r: 8 }]);
    expect(corner.x).toBe(0);
    expect(corner.y).toBe(0);
    expect(corner.w).toBe(MIN_VIEW_WIDTH);
  });

  it("contains every disc (with its label room) inside the box", () => {
    const nodes = [
      { x: 100, y: 400, r: 20 },
      { x: 500, y: 120, r: 5 },
    ];
    const v = fitViewBox(nodes);
    for (const n of nodes) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(v.x);
      expect(n.x + n.r).toBeLessThanOrEqual(v.x + v.w);
      expect(n.y - n.r).toBeGreaterThanOrEqual(v.y);
      expect(n.y + n.r + 16).toBeLessThanOrEqual(v.y + v.h);
    }
  });
});

describe("approachViewBox", () => {
  it("moves a fraction of the way and snaps when close", () => {
    const target = { x: 100, y: 50, w: 400, h: 300 };
    const step = approachViewBox(FULL_VIEW, target, 0.5);
    expect(step).toEqual({ x: 50, y: 25, w: 560, h: 410 });
    expect(approachViewBox({ x: 99.8, y: 50.2, w: 400.4, h: 300 }, target)).toEqual(target);
    expect(approachViewBox(target, target)).toEqual(target);
  });
});

describe("viewScale", () => {
  it("is 1 for the full canvas and shrinks as the view zooms in", () => {
    expect(viewScale(FULL_VIEW)).toBe(1);
    expect(viewScale({ x: 0, y: 0, w: GRAPH_WIDTH / 2, h: GRAPH_HEIGHT / 2 })).toBe(0.5);
  });
});
