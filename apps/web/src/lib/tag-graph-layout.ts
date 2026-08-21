// Pure layout helpers for the tag-exploration graph (views/TagGraphCanvas.tsx). No DOM and
// no d3 — the force simulation is the canvas's concern; these decide how big a node is,
// which labels fit, where a newcomer first appears and how the picture survives a
// selection change. Unit-tested; the canvas is covered by hand / e2e.

export const GRAPH_WIDTH = 720;
export const GRAPH_HEIGHT = 520;
export const MIN_RADIUS = 5;
export const MAX_RADIUS = 22;

// A node as the simulation sees it (structurally a d3 SimulationNodeDatum, positions
// always present). d3 mutates x/y/vx/vy in place.
export type GraphNode = {
  id: string;
  name: string;
  count: number;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

// Disc area ∝ count (radius ∝ √count): twice the quizzes reads as twice the ink, not 4×.
// The biggest tag gets MAX_RADIUS; a lone count of 1 among 1 is also the biggest.
export function nodeRadius(count: number, maxCount: number): number {
  if (maxCount <= 0 || count <= 0) return MIN_RADIUS;
  const t = Math.sqrt(Math.min(count, maxCount) / maxCount);
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * t;
}

// Edge stroke grows sub-linearly with how many quizzes carry both tags (1 → 1.5px).
export function edgeWidth(count: number): number {
  return 0.6 + 0.9 * Math.sqrt(Math.max(count, 1));
}

// Edge opacity grows with the co-occurrence count: a pair that shares one quiz is a faint
// hint (a 100-tag graph has hundreds of those and they would otherwise be a hairball), a
// pair that shares many is a visible bond. Capped so the strongest still shows the disc
// beneath it.
export function edgeOpacity(count: number): number {
  return Math.min(0.85, 0.18 + 0.14 * (Math.max(count, 1) - 1));
}

// The smallest count that still earns a text label when at most `maxLabels` fit: past that
// many nodes only the top-`maxLabels` by count are labelled (ties all show — a cut between
// equals would be arbitrary). 0 when every node fits; Infinity when none may.
export function labelThreshold(counts: readonly number[], maxLabels: number): number {
  if (maxLabels <= 0) return Infinity;
  if (counts.length <= maxLabels) return 0;
  const sorted = [...counts].sort((a, b) => b - a);
  return sorted[maxLabels - 1] ?? 0;
}

// Where node i first appears: a tight golden-angle spiral around the centre, so newcomers
// grow out of the middle instead of flying in from a corner, and no two start on the same
// spot (coincident nodes would be pinned together by the collision force).
export function seedPosition(
  i: number,
  width = GRAPH_WIDTH,
  height = GRAPH_HEIGHT,
): { x: number; y: number } {
  const angle = i * 2.399963229728653; // golden angle in radians
  const radius = 8 * Math.sqrt(i);
  return { x: width / 2 + radius * Math.cos(angle), y: height / 2 + radius * Math.sin(angle) };
}

// Keep a node's whole disc inside [0, size] with a small margin (the simulation has no
// walls of its own). Degenerates to the middle if the disc is wider than the box.
export function clampToBox(v: number, r: number, size: number, margin = 4): number {
  const lo = r + margin;
  const hi = size - r - margin;
  if (hi < lo) return size / 2;
  return Math.min(Math.max(v, lo), hi);
}

// This render's node objects, built from the previous render's: a tag that stays keeps its
// position and velocity (the picture drifts rather than re-rolls as the selection
// changes) with its count/radius refreshed; a newcomer gets a seed position. Returns
// fresh objects — the simulation mutates them, the caller keeps the new map.
export function reconcileNodes(
  prev: ReadonlyMap<string, GraphNode>,
  next: readonly { id: string; name: string; count: number }[],
  width = GRAPH_WIDTH,
  height = GRAPH_HEIGHT,
): GraphNode[] {
  let maxCount = 0;
  for (const n of next) maxCount = Math.max(maxCount, n.count);
  return next.map((n, i) => {
    const r = nodeRadius(n.count, maxCount);
    const p = prev.get(n.id);
    if (p) return { id: n.id, name: n.name, count: n.count, r, x: p.x, y: p.y, vx: p.vx, vy: p.vy };
    const { x, y } = seedPosition(i, width, height);
    return { id: n.id, name: n.name, count: n.count, r, x, y, vx: 0, vy: 0 };
  });
}

// ---- Auto-fit: the SVG viewBox follows the nodes ----
//
// The simulation lays nodes out inside the fixed GRAPH_WIDTH × GRAPH_HEIGHT box, but a
// narrowed selection leaves a handful of nodes huddled in the middle of it. Instead of
// moving the nodes, the view zooms: the viewBox is fitted to the nodes' bounding box
// (never beyond the canvas, never closer than MIN_VIEW_WIDTH — a lone pair of tags should
// not become a poster) and eased toward that target every tick, so a selection change
// glides rather than jumps.

export type ViewBox = { x: number; y: number; w: number; h: number };
export const FULL_VIEW: ViewBox = { x: 0, y: 0, w: GRAPH_WIDTH, h: GRAPH_HEIGHT };
export const MIN_VIEW_WIDTH = 360;
// Room under a disc for its label, in view units at full zoom.
const LABEL_ROOM = 16;

export function fitViewBox(
  nodes: readonly { x: number; y: number; r: number }[],
  pad = 28,
): ViewBox {
  if (nodes.length === 0) return FULL_VIEW;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x - n.r);
    x1 = Math.max(x1, n.x + n.r);
    y0 = Math.min(y0, n.y - n.r);
    y1 = Math.max(y1, n.y + n.r + LABEL_ROOM);
  }
  const aspect = GRAPH_WIDTH / GRAPH_HEIGHT;
  let w = Math.max(x1 - x0 + 2 * pad, MIN_VIEW_WIDTH);
  let h = Math.max(y1 - y0 + 2 * pad, MIN_VIEW_WIDTH / aspect);
  // Keep the canvas's aspect ratio (the SVG preserves it anyway; doing it here keeps the
  // box centred on the nodes instead of letting the browser pick the slack's side).
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  w = Math.min(w, GRAPH_WIDTH);
  h = Math.min(h, GRAPH_HEIGHT);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const x = Math.min(Math.max(cx - w / 2, 0), GRAPH_WIDTH - w);
  const y = Math.min(Math.max(cy - h / 2, 0), GRAPH_HEIGHT - h);
  return { x, y, w, h };
}

// One easing step from `current` toward `target` (fraction `t` of the remaining distance),
// snapping once within half a unit so the view comes to rest instead of creeping forever.
export function approachViewBox(current: ViewBox, target: ViewBox, t = 0.15): ViewBox {
  const step = (a: number, b: number) => (Math.abs(b - a) < 0.5 ? b : a + (b - a) * t);
  return {
    x: step(current.x, target.x),
    y: step(current.y, target.y),
    w: step(current.w, target.w),
    h: step(current.h, target.h),
  };
}

// The zoom factor of a view (1 = full canvas, smaller = zoomed in). Text and strokes are
// drawn in view units, so anything that should keep its on-screen size is multiplied by it.
export function viewScale(view: ViewBox): number {
  return view.w / GRAPH_WIDTH;
}
