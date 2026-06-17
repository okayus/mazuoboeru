import useSWR from "swr";
import { api, isApiError } from "../api";
import { QuizMarkdown } from "../QuizMarkdown";

// "my hot" = the user's favorited quizzes (CONTEXT.md Favorite). Private; listed
// newest-favorited first, filtered to currently-published quizzes by the server.
export function MyHot() {
  const { data, error } = useSWR("favorites", () => api.favorites(), {
    shouldRetryOnError: false,
  });

  if (isApiError(error) && error.status === 401)
    return (
      <p>
        my hot には <a href="#/login">ログイン</a> が必要です。
      </p>
    );
  if (error) return <p className="error">読み込みに失敗しました</p>;
  if (!data) return <p>読み込み中…</p>;
  const items = data.quizzes;

  return (
    <div>
      <h2>my hot（お気に入り）</h2>
      {items.length === 0 ? (
        <p>まだお気に入りはありません。挑戦画面の「☆ my hot に登録」で追加できます。</p>
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
                    <span key={t} className="tag">
                      {t}
                    </span>
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
