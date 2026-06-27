import { type MouseEvent, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { api, isApiError } from "../api";
import { DrillQuestionCard, type Stat } from "./DrillQuestionCard";

// Solve a single Review List question in a dialog, without leaving "my hot list" — a Drill scoped
// to one question (CONTEXT.md Drill). Fetches that one question (choices, never is_correct — the
// answer key stays server-side, ADR-0010); the shared card submits to POST /drill/answers and
// shows Immediate Feedback. "覚えた" removes it from the Review List (and the list row) and closes;
// "閉じる" leaves it. Native <dialog> (Esc / backdrop / ✕ close it); membership lives in the list.
export function ReviewQuestionDialog({
  questionId,
  quizId,
  quizTitle,
  onClose,
  onGraduated,
}: {
  questionId: string;
  quizId: string;
  quizTitle: string;
  onClose: () => void;
  onGraduated: (questionId: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { data, error } = useSWR(
    `drill-question/${questionId}`,
    () => api.drillQuestion(questionId),
    { shouldRetryOnError: false, revalidateOnFocus: false },
  );
  const [stat, setStat] = useState<Stat | undefined>(undefined);
  const [graduating, setGraduating] = useState(false);

  // Open as a true modal on mount.
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  // Seed the displayed all-time accuracy from the server, then bump it locally on each answer.
  useEffect(() => {
    if (data) setStat(data.stat ?? undefined);
  }, [data]);

  const onAnswered = (_questionId: string, isCorrect: boolean) =>
    setStat((prev) => {
      const s = prev ?? { correct: 0, total: 0 };
      return { correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 };
    });

  const close = () => ref.current?.close();
  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) close();
  };

  // "覚えた" = remove from the Review List, drop the row, and close. Optimistic: a failure leaves
  // it in the list (it can be graduated again).
  const graduate = async () => {
    setGraduating(true);
    try {
      await api.removeFromReviewList(questionId);
    } catch {
      // non-fatal
    }
    onGraduated(questionId);
  };

  return (
    <dialog ref={ref} className="drill-dialog" onClose={onClose} onClick={onBackdrop}>
      <div className="drill-dialog-inner">
        <div className="drill-dialog-head">
          <span className="meta">設問を解く</span>
          <button type="button" className="link" onClick={close}>
            ✕ 閉じる
          </button>
        </div>
        {isApiError(error) && error.status === 404 ? (
          <p className="error">この設問は現在挑戦できません（非公開・削除など）。</p>
        ) : error ? (
          <p className="error">読み込みに失敗しました</p>
        ) : !data ? (
          <p>読み込み中…</p>
        ) : (
          <DrillQuestionCard
            item={data.item}
            stat={stat}
            source={
              <>
                出典: <a href={`#/quiz/${quizId}`}>{quizTitle}</a>
              </>
            }
            onAnswered={onAnswered}
            actions={
              <div className="btn-row">
                <button onClick={graduate} disabled={graduating}>
                  {graduating ? "外しています…" : "覚えた（リストから外す）"}
                </button>
                <button type="button" className="link" onClick={close}>
                  閉じる（まだ）
                </button>
              </div>
            }
          />
        )}
      </div>
    </dialog>
  );
}
