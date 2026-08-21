import { itemsWithAllTags, tagGraph } from "@mazuoboeru/core";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { api, type TagGraphData } from "../api";
import { TagGraphCanvas } from "./TagGraphCanvas";

// #/tags — the tag-exploration graph (ADR-0016). One fetch brings the whole published
// incidence table (quiz → tag ids, no timeline cap); everything shown — node sizes, edges,
// AND narrowing, Related Tags chips, the matching quizzes — is derived here with the same
// @mazuoboeru/core functions the worker uses for `?tags=`, so the two surfaces agree.
export function TagExplorer() {
  const { data, error } = useSWR("public/tag-graph", () => api.tagGraph());
  // The selection (tag ids, AND) is local state like the timeline's; the derived view is
  // memoised so the canvas only restarts its layout when data or selection change.
  const [selected, setSelected] = useState<string[]>([]);
  const view = useMemo(() => (data ? derive(data, selected) : null), [data, selected]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  if (error) return <p className="error">読み込みに失敗しました</p>;
  if (!view) return <p>読み込み中…</p>;
  const nameOf = (id: string) => view.names.get(id) ?? "?";

  return (
    <div>
      <h2>タグを探す</h2>
      <p className="meta">
        タグ {view.tagCount} 件・タグ付きの公開クイズ {view.quizCount} 件。
        丸の大きさ＝そのタグが付いた公開クイズの数、線＝同じクイズに一緒に付いている回数。
        丸やチップをクリックすると絞り込み（複数選ぶと AND）、一緒に付いていないタグは消えます。
      </p>

      {selected.length ? (
        <p className="tag-filter">
          タグ:{" "}
          {selected.map((id) => (
            <button key={id} className="tag" onClick={() => toggle(id)} title="この絞り込みを外す">
              {nameOf(id)} ✕
            </button>
          ))}{" "}
          <button className="link" onClick={() => setSelected([])}>
            絞り込みを解除
          </button>
        </p>
      ) : null}

      {view.tagCount === 0 ? (
        <p>タグの付いた公開クイズはまだありません。</p>
      ) : view.nodes.length === 0 ? (
        <p>このタグの組み合わせのクイズはまだありません。</p>
      ) : (
        <TagGraphCanvas
          nodes={view.nodes}
          edges={view.edges}
          selected={view.selectedSet}
          onToggle={toggle}
        />
      )}

      {view.related.length ? (
        <div className="tag-nav">
          <div className="tags">
            <span className="meta">
              {selected.length ? "一緒に付いているタグ:" : "人気のタグ:"}
            </span>
            {view.related.map((r) => (
              <button key={r.id} className="tag" onClick={() => toggle(r.id)}>
                {r.name} <span className="count">{r.count}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selected.length ? (
        <section>
          <h3>該当するクイズ（{view.matching.length} 件）</h3>
          <ul className="quiz-list">
            {view.matching.map((q) => (
              <li key={q.id} className="card compact">
                <a href={`#/quiz/${q.id}`}>
                  <h3>{q.title}</h3>
                </a>
                <div className="tags">
                  {q.tagIds.map((id) => (
                    <button
                      key={id}
                      className={view.selectedSet.has(id) ? "tag selected" : "tag"}
                      onClick={() => toggle(id)}
                    >
                      {nameOf(id)}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// Everything the page shows, derived from the payload and the selection (pure).
function derive(data: TagGraphData, selected: string[]) {
  const names = new Map(data.tags.map((t) => [t.id, t.name]));
  const nameOf = (id: string) => names.get(id) ?? "?";
  const selectedSet = new Set(selected);
  // data.quizzes is a TaggedItem list ({ id, tagIds } plus the title the list shows).
  const graph = tagGraph(data.quizzes, selected);
  const nodes = graph.nodes.map((n) => ({ id: n.tagId, name: nameOf(n.tagId), count: n.count }));
  return {
    names,
    selectedSet,
    nodes,
    edges: graph.edges,
    // Related Tags of the selection (CONTEXT.md) — the graph's non-selected nodes.
    related: nodes.filter((n) => !selectedSet.has(n.id)),
    matching: itemsWithAllTags(data.quizzes, selected),
    tagCount: data.tags.length,
    quizCount: data.quizzes.length,
  };
}
