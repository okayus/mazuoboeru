import { useEffect, useState } from "react";
import { api, type TimelineItem } from "../api";
import { QuizMarkdown } from "../QuizMarkdown";

export function Timeline() {
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .timeline()
      .then((r) => setItems(r.quizzes))
      .catch(() => setError("読み込みに失敗しました"));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!items) return <p>読み込み中…</p>;
  if (items.length === 0) return <p>まだ公開されたクイズはありません。</p>;

  return (
    <ul className="quiz-list">
      {items.map((q) => (
        <li key={q.id} className="card">
          <a href={`#/quiz/${q.id}`}>
            <h3>{q.title}</h3>
          </a>
          <div className="meta">
            作者: {q.authorDisplayName} ・ {q.questionCount} 問
          </div>
          {q.description ? <QuizMarkdown>{q.description}</QuizMarkdown> : null}
        </li>
      ))}
    </ul>
  );
}
