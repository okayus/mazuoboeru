import { useState } from "react";
import useSWR from "swr";
import { api, isApiError, type QuizDrillItem } from "../api";
import { type ResultEntry, type ResultFeedback } from "../lib/challenge-result";
import { shuffle } from "../lib/shuffle";
import { ChallengeResult } from "./ChallengeResult";
import { DrillQuestionCard, type Stat } from "./DrillQuestionCard";
import { ReportButton } from "./ReportButton";

// "挑戦" = a quiz-scoped Drill: solve every question of one published quiz, one at a time,
// server-graded with Immediate Feedback (CONTEXT.md Challenge/Drill; ADR-0013). The former
// Attempt entity is retired — there is no per-run row and no resume; each answer is its own
// Answer row, recorded server-side as it is submitted. Stateless and advance-only (like the
// Review List Drill): leaving and returning restarts from the top. Question order is shuffled
// per mount (anti-position-memorization, like the per-mount choice shuffle #61).
// After the last question the Challenge Result (CONTEXT.md) sums up this pass from what the
// cards reported — on screen only, never stored (ADR-0013 addendum 2026-09-13).
export function QuizDrill({ quizId }: { quizId: string }) {
  const { data, error, mutate } = useSWR(`quiz-drill/${quizId}`, () => api.quizDrill(quizId), {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });
  // "もう一度挑戦": re-fetch the pool (fresh per-question accuracy incl. this pass, current
  // Review List membership, and the quiz as it is now — ADR-0014 edits included), then remount
  // the runner so the pass starts from the top with a new shuffle.
  const [runKey, setRunKey] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const restart = async () => {
    setRetrying(true);
    try {
      await mutate();
    } catch {
      // A failed refresh still restarts (with the data we have); a 404 surfaces via `error`.
    } finally {
      setRetrying(false);
      setRunKey((k) => k + 1);
    }
  };

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
      key={runKey}
      quizId={quizId}
      quizTitle={data.quizTitle}
      pool={data.items}
      initialStats={data.questionStats}
      initialReviewIds={data.reviewListQuestionIds}
      onRestart={restart}
      restarting={retrying}
    />
  );
}

function QuizDrillRunner({
  quizId,
  quizTitle,
  pool,
  initialStats,
  initialReviewIds,
  onRestart,
  restarting,
}: {
  quizId: string;
  quizTitle: string;
  pool: QuizDrillItem[];
  initialStats: Record<string, Stat>;
  initialReviewIds: string[];
  onRestart: () => void;
  restarting: boolean;
}) {
  // Question order shuffled once per mount (ADR-0013; mirrors the per-mount choice shuffle #61).
  const [orderedPool] = useState(() => shuffle(pool));
  const [idx, setIdx] = useState(0);
  // Seeded once from the server; bumped locally as the user answers (ADR-0006 activity).
  const [stats, setStats] = useState<Record<string, Stat>>(initialStats);
  const [reviewSet, setReviewSet] = useState<Set<string>>(new Set(initialReviewIds));
  // This pass's graded answers in presentation order — the Challenge Result's only input.
  // Exactly one per question: the card advances only after a successful grade.
  const [entries, setEntries] = useState<ResultEntry[]>([]);

  const total = orderedPool.length;
  const current = orderedPool[idx];
  const advance = () => setIdx((i) => i + 1);

  const onAnswered = (questionId: string, feedback: ResultFeedback) => {
    setStats((prev) => {
      const s = prev[questionId] ?? { correct: 0, total: 0 };
      return {
        ...prev,
        [questionId]: { correct: s.correct + (feedback.isCorrect ? 1 : 0), total: s.total + 1 },
      };
    });
    const item = orderedPool.find((q) => q.questionId === questionId);
    if (item) setEntries((prev) => [...prev, { item, feedback }]);
  };

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

      {current ? (
        <>
          <p className="progress">{`${idx + 1} / ${total} 問`}</p>
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
            actions={<button onClick={advance}>{idx < total - 1 ? "次へ →" : "結果を見る"}</button>}
          />
        </>
      ) : (
        <ChallengeResult
          entries={entries}
          isInReviewList={(questionId) => reviewSet.has(questionId)}
          onToggleReviewList={onToggleReviewList}
          onRetry={onRestart}
          retrying={restarting}
        />
      )}
    </div>
  );
}
