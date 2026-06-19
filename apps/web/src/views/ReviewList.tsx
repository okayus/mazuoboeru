import { useState } from "react";
import useSWR from "swr";
import { api, isApiError } from "../api";
import { QuizMarkdown } from "../QuizMarkdown";

// "my hot list" = the user's Review List — a private, question-level pool to revisit
// (CONTEXT.md Review List; replaces the quiz-level favorite). Flat, newest-first; each
// row is the question prompt + its source quiz, with a remove ("外す") action. The
// server filters to currently-published questions. (Drill over the pool is Slice 2.)
export function ReviewList() {
  const { data, error, mutate } = useSWR("review-list", () => api.reviewList(), {
    shouldRetryOnError: false,
  });
  const [removing, setRemoving] = useState<string | null>(null);

  if (isApiError(error) && error.status === 401)
    return (
      <p>
        my hot list には <a href="#/login">ログイン</a> が必要です。
      </p>
    );
  if (error) return <p className="error">読み込みに失敗しました</p>;
  if (!data) return <p>読み込み中…</p>;
  const items = data.items;

  const remove = async (questionId: string) => {
    setRemoving(questionId);
    try {
      await api.removeFromReviewList(questionId);
      await mutate(
        (prev) =>
          prev ? { items: prev.items.filter((i) => i.questionId !== questionId) } : prev,
        { revalidate: false },
      );
    } catch {
      // non-fatal; leave the row in place
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div>
      <h2>my hot list（復習リスト）</h2>
      {items.length > 0 ? (
        <p className="quiz-actions">
          <a href="#/drill">▶ ドリルを始める</a>（{items.length} 問を1問ずつ解き直す）
        </p>
      ) : null}
      {items.length === 0 ? (
        <p>
          まだ設問がありません。挑戦画面で各設問の「☆ 復習リストに追加」から、覚え直したい設問を入れられます。
        </p>
      ) : (
        <ul className="quiz-list">
          {items.map((it) => (
            <li key={it.questionId} className="card">
              <QuizMarkdown>{it.prompt}</QuizMarkdown>
              <div className="meta">
                出典: <a href={`#/quiz/${it.quizId}`}>{it.quizTitle}</a>
              </div>
              <button
                className="link"
                disabled={removing === it.questionId}
                onClick={() => remove(it.questionId)}
              >
                {removing === it.questionId ? "外しています…" : "外す"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
