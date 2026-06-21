import { useState } from "react";
import useSWR from "swr";
import { api, type DrillItem, isApiError } from "../api";
import { shuffle } from "../lib/shuffle";
import { QuizMarkdown } from "../QuizMarkdown";

type Stat = { correct: number; total: number };
// Post-grade feedback, discriminated by question type (ADR-0012).
type Feedback =
  | {
      type: "mcq_single" | "mcq_multi";
      isCorrect: boolean;
      explanation: string | null;
      correctChoiceIds: string[];
    }
  | {
      type: "short";
      isCorrect: boolean;
      explanation: string | null;
      submittedText: string;
      acceptedAnswers: string[];
    };

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
        <DrillCard
          key={current.questionId}
          item={current}
          stat={stats[current.questionId]}
          onAnswered={onAnswered}
          onGraduate={() => graduate(current.questionId)}
          onKeep={advance}
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

function DrillCard({
  item,
  stat,
  onAnswered,
  onGraduate,
  onKeep,
}: {
  item: DrillItem;
  stat: Stat | undefined;
  onAnswered: (questionId: string, isCorrect: boolean) => void;
  onGraduate: () => void;
  onKeep: () => void;
}) {
  const isShort = item.type === "short";
  const isMulti = item.type === "mcq_multi";
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  // Display-only choice shuffle, fresh per presentation. Drill is advance-only and
  // stateless (no revisit, no resume), so one mount = one card showing = one order;
  // the next drill session re-fetches the pool and re-rolls. Grading is id-based.
  // Empty for short (no choices) — harmless.
  const [orderedChoices] = useState(() => shuffle(item.choices));

  const locked = feedback !== null;
  const statText =
    stat && stat.total > 0
      ? `${Math.round((stat.correct / stat.total) * 100)}%（${stat.correct}/${stat.total}）`
      : "初挑戦";

  const toggle = (choiceId: string) => {
    if (locked) return;
    setSelected((prev) =>
      isMulti
        ? prev.includes(choiceId)
          ? prev.filter((id) => id !== choiceId)
          : [...prev, choiceId]
        : [choiceId],
    );
  };

  const submitSelection = async () => {
    if (selected.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.submitDrillAnswer(item.questionId, { choiceIds: selected });
      if (r.reveal.type === "short") return; // unreachable for an mcq question
      setFeedback({
        type: r.reveal.type,
        isCorrect: r.isCorrect,
        explanation: r.explanation,
        correctChoiceIds: r.reveal.correctChoiceIds,
      });
      onAnswered(item.questionId, r.isCorrect);
    } catch {
      setError("送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const submitText = async () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.submitDrillAnswer(item.questionId, { text: trimmed });
      if (r.reveal.type !== "short") return; // unreachable for a short question
      setFeedback({
        type: "short",
        isCorrect: r.isCorrect,
        explanation: r.explanation,
        submittedText: trimmed,
        acceptedAnswers: r.reveal.acceptedAnswers,
      });
      onAnswered(item.questionId, r.isCorrect);
    } catch {
      setError("送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`card question ${locked ? (feedback.isCorrect ? "correct" : "wrong") : ""}`}>
      <div className="q-head">
        <span className="badge">{isShort ? "一問一答" : isMulti ? "複数選択" : "単一選択"}</span>
        {locked ? <span className="badge">{feedback.isCorrect ? "正解" : "不正解"}</span> : null}
      </div>
      <div className="meta">
        出典: <a href={`#/quiz/${item.quizId}`}>{item.quizTitle}</a> ・ この設問の通算正答率:{" "}
        {statText}
      </div>
      <QuizMarkdown>{item.prompt}</QuizMarkdown>

      {isShort ? (
        feedback && feedback.type === "short" ? (
          <div className="short-answer answered">
            <div className="meta">あなたの解答: {feedback.submittedText || "（無回答）"}</div>
            <div>
              正解: <strong>{feedback.acceptedAnswers[0] ?? ""}</strong>
              {feedback.acceptedAnswers.length > 1 ? (
                <span className="meta">
                  （別解: {feedback.acceptedAnswers.slice(1).join(" / ")}）
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="short-answer">
            <input
              type="text"
              value={text}
              placeholder="答えを入力"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitText();
              }}
            />
          </div>
        )
      ) : (
        <ul className="choices">
          {orderedChoices.map((ch) => {
            const chosen = selected.includes(ch.id);
            const correct =
              locked && feedback.type !== "short" && feedback.correctChoiceIds.includes(ch.id);
            return (
              <li
                key={ch.id}
                className={correct ? "choice-correct" : chosen ? "choice-chosen" : ""}
              >
                <label>
                  <input
                    type={isMulti ? "checkbox" : "radio"}
                    name={`drill-${item.questionId}`}
                    checked={chosen}
                    disabled={locked}
                    onChange={() => toggle(ch.id)}
                  />
                  {ch.text}
                  {correct ? " ✓" : ""}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {error ? <p className="error">{error}</p> : null}

      {!locked ? (
        <button
          onClick={isShort ? submitText : submitSelection}
          disabled={submitting || (isShort ? text.trim().length === 0 : selected.length === 0)}
        >
          {submitting ? "採点中…" : "回答する"}
        </button>
      ) : (
        <>
          {feedback.explanation ? (
            <div className="explanation">
              <strong>解説:</strong>
              <QuizMarkdown>{feedback.explanation}</QuizMarkdown>
            </div>
          ) : null}
          <div className="btn-row">
            <button onClick={onGraduate}>覚えた（リストから外す）</button>
            <button className="link" onClick={onKeep}>
              まだ（残す）
            </button>
          </div>
        </>
      )}
    </div>
  );
}
