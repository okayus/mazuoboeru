import { useState } from "react";
import useSWR from "swr";
import { api } from "../api";
import { QuizMarkdown } from "../QuizMarkdown";

// Chip caps. With nothing selected `related` is the whole popularity list (100+ tags in
// prod); the tag-exploration graph (next slice) is the full view — the timeline shows the head.
const POPULAR_LIMIT = 15;
const RELATED_LIMIT = 30;

export function Timeline() {
  // The tag selection (AND — tags are flat, ADR-0016) lives in local state; the SWR key
  // includes it (JSON-encoded: a tag name may contain any delimiter) so each selection's
  // timeline is cached/deduped separately and revalidates on focus.
  const [selected, setSelected] = useState<string[]>([]);
  const key = selected.length
    ? `public/quizzes?tags=${JSON.stringify(selected)}`
    : "public/quizzes";
  const { data, error } = useSWR(key, () => api.timeline(selected));

  const add = (t: string) => setSelected((s) => (s.includes(t) ? s : [...s, t]));
  const remove = (t: string) => setSelected((s) => s.filter((x) => x !== t));

  if (error) return <p className="error">読み込みに失敗しました</p>;
  if (!data) return <p>読み込み中…</p>;
  const items = data.quizzes;
  // Related Tags of the selection (CONTEXT.md) — with no selection, the popularity list.
  const related = data.related.slice(0, selected.length ? RELATED_LIMIT : POPULAR_LIMIT);

  return (
    <div>
      {selected.length ? (
        <p className="tag-filter">
          タグ:{" "}
          {selected.map((t) => (
            <button key={t} className="tag" onClick={() => remove(t)} title="この絞り込みを外す">
              {t} ✕
            </button>
          ))}{" "}
          <button className="link" onClick={() => setSelected([])}>
            絞り込みを解除
          </button>
        </p>
      ) : null}

      {related.length ? (
        <div className="tag-nav">
          <div className="tags">
            <span className="meta">
              {selected.length ? "一緒に付いているタグ:" : "人気のタグ:"}
            </span>
            {related.map((r) => (
              <button key={r.name} className="tag" onClick={() => add(r.name)}>
                {r.name} <span className="count">{r.count}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p>
          {selected.length
            ? "このタグの組み合わせのクイズはまだありません。"
            : "まだ公開されたクイズはありません。"}
        </p>
      ) : (
        <ul className="quiz-list">
          {items.map((q) => (
            <li key={q.id} className="card">
              <a href={`#/quiz/${q.id}`}>
                <h3>{q.title}</h3>
              </a>
              <div className="meta">
                作者: {q.authorDisplayName} ・ {q.questionCount} 問
              </div>
              {q.tags.length ? (
                <div className="tags">
                  {q.tags.map((t) => (
                    <button key={t} className="tag" onClick={() => add(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              ) : null}
              {q.description ? <QuizMarkdown>{q.description}</QuizMarkdown> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
