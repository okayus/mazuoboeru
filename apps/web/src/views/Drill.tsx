import { useState } from "react";
import useSWR from "swr";
import { api, type DrillItem, isApiError } from "../api";
import { DrillQuestionCard, type Stat } from "./DrillQuestionCard";

// Drill = solve the Review List questions one at a time, server-graded with immediate
// feedback, then "覚えた（外す）/ まだ（残す）" (CONTEXT.md Drill; ADR-0008). Stateless: the whole
// pool is fetched once (whole-pool fetch) and walked client-side — nothing resumes, leaving
// and coming back starts the session over (each answer was already recorded server-side).
export function Drill() {
  const { data, error } = useSWR("drill", () => api.drill(), {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });

  if (isApiError(error) && error.status === 401)
    return (
      <p>
        ドリルには <a href="#/login">ログイン</a> が必要です。
      </p>
    );
  if (error) return <p className="error">読み込みに失敗しました</p>;
  if (!data) return <p>読み込み中…</p>;
  if (data.items.length === 0)
    return (
      <div>
        <h2>ドリル</h2>
        <p>
          復習リストが空です。挑戦画面の「☆ 復習リストに追加」や{" "}
          <a href="#/review-list">my hot list</a> から、覚え直したい設問を入れてください。
        </p>
      </div>
    );

  return <DrillRunner pool={data.items} initialStats={data.questionStats} />;
}

function DrillRunner({
  pool,
  initialStats,
}: {
  pool: DrillItem[];
  initialStats: Record<string, Stat>;
}) {
  const [idx, setIdx] = useState(0);
  // Seeded once from the server; bumped locally as the user answers (ADR-0006 activity).
  const [stats, setStats] = useState<Record<string, Stat>>(initialStats);
  const [graduatedCount, setGraduatedCount] = useState(0);

  const total = pool.length;
  const current = pool[idx];
  const advance = () => setIdx((i) => i + 1);

  const onAnswered = (questionId: string, isCorrect: boolean) =>
    setStats((prev) => {
      const s = prev[questionId] ?? { correct: 0, total: 0 };
      return {
        ...prev,
        [questionId]: { correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 },
      };
    });

  // "覚えた" = remove from the Review List (server), then advance. Optimistic: a failure
  // leaves it in the pool (it can be graduated again next session).
  const graduate = async (questionId: string) => {
    setGraduatedCount((n) => n + 1);
    try {
      await api.removeFromReviewList(questionId);
    } catch {
      // non-fatal
    }
    advance();
  };

  return (
    <div>
      <h2>ドリル（復習リスト）</h2>
      <p className="progress">{current ? `${idx + 1} / ${total} 問` : `${total} / ${total} 問`}</p>

      {current ? (
        <DrillQuestionCard
          key={current.questionId}
          item={current}
          stat={stats[current.questionId]}
          source={
            <>
              出典: <a href={`#/quiz/${current.quizId}`}>{current.quizTitle}</a>
            </>
          }
          onAnswered={onAnswered}
          actions={
            <div className="btn-row">
              <button onClick={() => graduate(current.questionId)}>覚えた（リストから外す）</button>
              <button className="link" onClick={advance}>
                まだ（残す）
              </button>
            </div>
          }
        />
      ) : (
        <div className="card">
          <p>
            おつかれさま！ このセッションのドリルは終わりです
            {graduatedCount > 0 ? `（${graduatedCount} 問を「覚えた」で外しました）` : ""}。
          </p>
          <p className="meta">
            <a href="#/review-list">my hot list</a> ／ <a href="#/dashboard">ダッシュボード</a>
          </p>
        </div>
      )}
    </div>
  );
}
