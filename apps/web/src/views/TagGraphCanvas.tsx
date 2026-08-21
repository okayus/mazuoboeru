import type { TagEdge } from "@mazuoboeru/core";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
} from "d3-force";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  approachViewBox,
  clampToBox,
  edgeOpacity,
  edgeWidth,
  fitViewBox,
  FULL_VIEW,
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  type GraphNode,
  labelThreshold,
  reconcileNodes,
  type ViewBox,
  viewScale,
} from "../lib/tag-graph-layout";

export type CanvasNode = { id: string; name: string; count: number };

type Props = {
  // Already narrowed to the selection (tagGraph() in @mazuoboeru/core) — the canvas only
  // draws. Both arrays must be referentially stable between renders (useMemo upstream):
  // a new array restarts the layout.
  nodes: readonly CanvasNode[];
  edges: readonly TagEdge[];
  selected: ReadonlySet<string>;
  onToggle: (tagId: string) => void;
};

type Link = SimulationLinkDatum<GraphNode> & { key: string; count: number };

// At most this many text labels when nothing is selected (prod has 100+ tags; every label
// at once is unreadable). Selected, hovered and hovered-neighbour nodes are always labelled.
const MAX_LABELS = 40;

// d3 swaps a link's id endpoints for node objects when the link force initialises; until
// then (or for an unknown id) they are still ids, and such a link is simply not drawn.
function endpoint(v: GraphNode | string | number): GraphNode | null {
  return typeof v === "object" ? v : null;
}

// d3-force layout rendered as plain React SVG: the simulation mutates the node objects
// and each tick publishes a new frame; React draws the current positions. Nodes persist by
// id across selection changes (reconcileNodes), so the picture drifts instead of
// re-rolling when the tags that don't fit disappear, and the viewBox eases onto whatever
// is left (fitViewBox) so a narrowed graph fills the canvas instead of huddling in it.
export function TagGraphCanvas({ nodes, edges, selected, onToggle }: Props) {
  const byId = useRef<Map<string, GraphNode>>(new Map());
  const viewRef = useRef<ViewBox>(FULL_VIEW);
  const [frame, setFrame] = useState<{ nodes: GraphNode[]; links: Link[]; view: ViewBox }>({
    nodes: [],
    links: [],
    view: FULL_VIEW,
  });
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const simNodes = reconcileNodes(byId.current, nodes);
    const fresh = byId.current.size === 0;
    byId.current = new Map(simNodes.map((n) => [n.id, n]));
    const links: Link[] = edges.map((e) => ({
      key: `${e.a} ${e.b}`,
      source: e.a,
      target: e.b,
      count: e.count,
    }));

    const sim = forceSimulation<GraphNode>(simNodes)
      .force(
        "link",
        forceLink<GraphNode, Link>(links)
          .id((n) => n.id)
          // Tags that share more quizzes sit closer; big discs keep their distance.
          .distance((l) => {
            const s = endpoint(l.source);
            const t = endpoint(l.target);
            return 24 + (s?.r ?? 0) + (t?.r ?? 0) + 40 / l.count;
          }),
      )
      .force("charge", forceManyBody<GraphNode>().strength(-90).distanceMax(300))
      // Gentle gravity instead of forceCenter: components that share no edge would
      // otherwise drift to the walls, and forceCenter's translation fights the clamp.
      .force("x", forceX<GraphNode>(GRAPH_WIDTH / 2).strength(0.05))
      .force("y", forceY<GraphNode>(GRAPH_HEIGHT / 2).strength(0.07))
      .force(
        "collide",
        forceCollide<GraphNode>()
          // Extra room for the label under each disc.
          .radius((n) => n.r + 7)
          .iterations(2),
      )
      .alpha(fresh ? 1 : 0.7)
      .on("tick", () => {
        for (const n of simNodes) {
          n.x = clampToBox(n.x, n.r, GRAPH_WIDTH);
          n.y = clampToBox(n.y, n.r, GRAPH_HEIGHT);
        }
        viewRef.current = approachViewBox(viewRef.current, fitViewBox(simNodes));
        setFrame({ nodes: simNodes, links, view: viewRef.current });
      });
    return () => {
      sim.stop();
    };
  }, [nodes, edges]);

  const threshold = useMemo(
    () =>
      labelThreshold(
        nodes.map((n) => n.count),
        MAX_LABELS,
      ),
    [nodes],
  );
  // The hovered node's neighbours (to light their edges and show their labels).
  const neighbours = useMemo(() => {
    const set = new Set<string>();
    if (hover === null) return set;
    for (const e of edges) {
      if (e.a === hover) set.add(e.b);
      else if (e.b === hover) set.add(e.a);
    }
    return set;
  }, [edges, hover]);

  // Text is drawn in view units; multiplying by the zoom keeps its on-screen size (strokes
  // use vector-effect for the same reason). Discs DO grow with the zoom — that's the point.
  const { view } = frame;
  const scale = viewScale(view);
  const fontSize = 11 * scale;

  return (
    <svg
      className={hover === null ? "tag-graph" : "tag-graph hovering"}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      role="group"
      aria-label="タグ探索グラフ"
    >
      <g>
        {frame.links.map((l) => {
          const s = endpoint(l.source);
          const t = endpoint(l.target);
          if (!s || !t) return null;
          const lit = hover !== null && (s.id === hover || t.id === hover);
          return (
            <line
              key={l.key}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              strokeWidth={edgeWidth(l.count)}
              strokeOpacity={edgeOpacity(l.count)}
              vectorEffect="non-scaling-stroke"
              className={lit ? "lit" : undefined}
            >
              <title>{`${s.name} と ${t.name}: 一緒に付いているクイズ ${l.count} 件`}</title>
            </line>
          );
        })}
      </g>
      <g>
        {frame.nodes.map((n) => {
          const isSelected = selected.has(n.id);
          const isNeighbour = neighbours.has(n.id);
          const labelled = isSelected || n.id === hover || isNeighbour || n.count >= threshold;
          // While hovering, everything outside the hovered node's neighbourhood steps back.
          const isDim = hover !== null && hover !== n.id && !isNeighbour;
          const cls = [
            "node",
            isSelected ? "selected" : "",
            isNeighbour ? "neighbour" : "",
            isDim ? "dim" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <g
              key={n.id}
              className={cls}
              transform={`translate(${n.x} ${n.y})`}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`${n.name}（公開クイズ ${n.count} 件）`}
              onClick={() => onToggle(n.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(n.id);
                }
              }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(n.id)}
              onBlur={() => setHover(null)}
            >
              <title>{`${n.name} — 公開クイズ ${n.count} 件`}</title>
              <circle r={n.r} vectorEffect="non-scaling-stroke" />
              {labelled ? (
                <text y={n.r + fontSize} fontSize={fontSize} strokeWidth={3 * scale}>
                  {n.name}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
