import useSWR from "swr";
import { api } from "../api";
import { QuizMarkdown } from "../QuizMarkdown";

export function Timeline() {
  // Cached + deduped across navigation (key "public/quizzes"); revalidates on focus.
  const { data, error } = useSWR("public/quizzes", () => api.timeline());

  if (error) return <p className="error">読み込みに失敗しました</p>;
  if (!data) return <p>読み込み中…</p>;
  const items = data.quizzes;
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
