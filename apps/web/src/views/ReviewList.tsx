import { useState } from "react";
import useSWR from "swr";
import { api, isApiError } from "../api";
import { QuizMarkdown } from "../QuizMarkdown";
import { ReviewQuestionDialog } from "./ReviewQuestionDialog";

// "my hot list" = the user's Review List — a private, question-level pool to revisit
// (CONTEXT.md Review List; replaces the quiz-level favorite). Flat, newest-first; each row is the
// question prompt + its source quiz ("出典" links to the whole quiz), with "解く" (drill just that
// one question in a dialog, without leaving the list — a Drill scoped to one question) and "外す"
// (remove). "▶ ドリルを始める" drills the whole pool. Server filters to currently-published questions.
export function ReviewList() {
  const { data, error, mutate } = useSWR("review-list", () => api.reviewList(), {
    shouldRetryOnError: false,
  });
  const [removing, setRemoving] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  if (isApiError(error) && error.status === 401)
    return (
      <p>
        my hot list には <a href="#/login">ログイン</a> が必要です。
      </p>
    );
  if (error) return <p className="error">読み込みに失敗しました</p>;
  if (!data) return <p>読み込み中…</p>;
  const items = data.items;
  const openItem = openId ? (items.find((i) => i.questionId === openId) ?? null) : null;

  const remove = async (questionId: string) => {
    setRemoving(questionId);
    try {
      await api.removeFromReviewList(questionId);
      await mutate(
        (prev) => (prev ? { items: prev.items.filter((i) => i.questionId !== questionId) } : prev),
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
          まだ設問がありません。挑戦画面で各設問の「☆
          復習リストに追加」から、覚え直したい設問を入れられます。
        </p>
      ) : (
        <ul className="quiz-list">
          {items.map((it) => (
            <li key={it.questionId} className="card">
              <QuizMarkdown>{it.prompt}</QuizMarkdown>
              <div className="meta">
                出典: <a href={`#/quiz/${it.quizId}`}>{it.quizTitle}</a>
              </div>
              <div className="btn-row">
                <button onClick={() => setOpenId(it.questionId)}>解く</button>
                <button
                  className="link"
                  disabled={removing === it.questionId}
                  onClick={() => remove(it.questionId)}
                >
                  {removing === it.questionId ? "外しています…" : "外す"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {openItem ? (
        <ReviewQuestionDialog
          questionId={openItem.questionId}
          quizId={openItem.quizId}
          quizTitle={openItem.quizTitle}
          onClose={() => setOpenId(null)}
          onGraduated={(qid) => {
            setOpenId(null);
            void mutate(
              (prev) => (prev ? { items: prev.items.filter((i) => i.questionId !== qid) } : prev),
              { revalidate: false },
            );
          }}
        />
      ) : null}
    </div>
  );
}
