import { useState } from "react";
import useSWR from "swr";
import { api } from "../api";
import { QuizMarkdown } from "../QuizMarkdown";

export function Timeline() {
  // Tag filter lives in local state; the SWR key includes it so each tag's
  // timeline is cached/deduped separately and revalidates on focus.
  const [tag, setTag] = useState<string | null>(null);
  const { data, error } = useSWR(tag ? `public/quizzes?tag=${tag}` : "public/quizzes", () =>
    api.timeline(tag ?? undefined),
  );

  if (error) return <p className="error">読み込みに失敗しました</p>;
  if (!data) return <p>読み込み中…</p>;
  const items = data.quizzes;

  return (
    <div>
      {tag ? (
        <p className="tag-filter">
          タグ: <span className="tag">{tag}</span>{" "}
          <button className="link" onClick={() => setTag(null)}>
            絞り込みを解除
          </button>
        </p>
      ) : null}

      {tag && data.related ? (
        <div className="tag-nav">
          {data.related.broader.length ? (
            <div className="tags">
              <span className="meta">広い:</span>
              {data.related.broader.map((t) => (
                <button key={t} className="tag" onClick={() => setTag(t)}>
                  ▲ {t}
                </button>
              ))}
            </div>
          ) : null}
          {data.related.narrower.length ? (
            <div className="tags">
              <span className="meta">絞り込む:</span>
              {data.related.narrower.map((t) => (
                <button key={t} className="tag" onClick={() => setTag(t)}>
                  ▼ {t}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 ? (
        <p>{tag ? "このタグのクイズはまだありません。" : "まだ公開されたクイズはありません。"}</p>
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
                    <button key={t} className="tag" onClick={() => setTag(t)}>
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
