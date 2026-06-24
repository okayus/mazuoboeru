import { useState } from "react";
import useSWR from "swr";
import { api, isApiError, type QuizDrillItem } from "../api";
import { shuffle } from "../lib/shuffle";
import { DrillQuestionCard, type Stat } from "./DrillQuestionCard";
import { ReportButton } from "./ReportButton";

// "挑戦" = a quiz-scoped Drill: solve every question of one published quiz, one at a time,
// server-graded with Immediate Feedback (CONTEXT.md Challenge/Drill; ADR-0013). The former
// Attempt entity is retired — there is no per-run score and no resume; each answer is its own
// Answer row, recorded server-side as it is submitted. Stateless and advance-only (like the
// Review List Drill): leaving and returning restarts from the top. Question order is shuffled
// per mount (anti-position-memorization, like the per-mount choice shuffle #61).
export function QuizDrill({ quizId }: { quizId: string }) {
  const { data, error } = useSWR(`quiz-drill/${quizId}`, () => api.quizDrill(quizId), {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });

  if (isApiError(error) && error.status === 401)
    return (
      <p>
        挑戦するには <a href="#/login">ログイン</a> が必要です。
      </p>
    );
  if (isApiError(error) && error.status === 404)
    return <p className="error">クイズが見つかりません</p>;
  if (error) return <p className="error">読み込みに失敗しました</p>;
  if (!data) return <p>読み込み中…</p>;
  if (data.items.length === 0) return <p className="error">このクイズには設問がありません。</p>;

  return (
    <QuizDrillRunner
      quizId={quizId}
      quizTitle={data.quizTitle}
      pool={data.items}
      initialStats={data.questionStats}
      initialReviewIds={data.reviewListQuestionIds}
    />
  );
}

function QuizDrillRunner({
  quizId,
  quizTitle,
  pool,
  initialStats,
  initialReviewIds,
}: {
  quizId: string;
  quizTitle: string;
  pool: QuizDrillItem[];
  initialStats: Record<string, Stat>;
  initialReviewIds: string[];
}) {
  // Question order shuffled once per mount (ADR-0013; mirrors the per-mount choice shuffle #61).
  const [orderedPool] = useState(() => shuffle(pool));
  const [idx, setIdx] = useState(0);
  // Seeded once from the server; bumped locally as the user answers (ADR-0006 activity).
  const [stats, setStats] = useState<Record<string, Stat>>(initialStats);
  const [reviewSet, setReviewSet] = useState<Set<string>>(new Set(initialReviewIds));

  const total = orderedPool.length;
  const current = orderedPool[idx];
  const advance = () => setIdx((i) => i + 1);

  const onAnswered = (questionId: string, isCorrect: boolean) =>
    setStats((prev) => {
      const s = prev[questionId] ?? { correct: 0, total: 0 };
      return {
        ...prev,
        [questionId]: { correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 },
      };
    });

  // Toggle this question's Review List membership (optimistic; reverts on failure).
  const onToggleReviewList = async (questionId: string, currentlyIn: boolean) => {
    setReviewSet((prev) => {
      const next = new Set(prev);
      if (currentlyIn) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
    try {
      if (currentlyIn) await api.removeFromReviewList(questionId);
      else await api.addToReviewList(questionId);
    } catch {
      setReviewSet((prev) => {
        const next = new Set(prev);
        if (currentlyIn) next.add(questionId);
        else next.delete(questionId);
        return next;
      });
    }
  };

  return (
    <div>
      <h2>{quizTitle}</h2>
      <div className="quiz-actions">
        <ReportButton targetType="quiz" targetId={quizId} label="このクイズを通報" />
      </div>
      <p className="progress">{current ? `${idx + 1} / ${total} 問` : `${total} / ${total} 問`}</p>

      {current ? (
        <DrillQuestionCard
          key={current.questionId}
          item={current}
          stat={stats[current.questionId]}
          headerExtra={
            <button
              className="link review-toggle"
              onClick={() =>
                onToggleReviewList(current.questionId, reviewSet.has(current.questionId))
              }
            >
              {reviewSet.has(current.questionId) ? "★ 復習リスト" : "☆ 復習リストに追加"}
            </button>
          }
          onAnswered={onAnswered}
          actions={<button onClick={advance}>{idx < total - 1 ? "次へ →" : "完了"}</button>}
        />
      ) : (
        <div className="card">
          <p>おつかれさま！ このクイズの挑戦は終わりです。</p>
          <p className="meta">
            <a href="#/">タイムライン</a> ／ <a href="#/dashboard">ダッシュボード</a>
          </p>
        </div>
      )}
    </div>
  );
}
