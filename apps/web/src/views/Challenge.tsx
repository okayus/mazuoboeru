import { memo, useCallback, useEffect, useState } from "react";
import { api, type AttemptState, isApiError, type PublicQuestion } from "../api";
import { shuffle } from "../lib/shuffle";
import { QuizMarkdown } from "../QuizMarkdown";
import { ReportButton } from "./ReportButton";

// Per-question feedback after grading, discriminated by question type (mcq highlights choices;
// short shows the typed answer + the canonical/accepted answers — plain text, ADR-0012).
type Feedback =
  | {
      type: "mcq_single" | "mcq_multi";
      isCorrect: boolean;
      explanation: string | null;
      selectedChoiceIds: string[];
      correctChoiceIds: string[];
    }
  | {
      type: "short";
      isCorrect: boolean;
      explanation: string | null;
      submittedText: string;
      acceptedAnswers: string[];
    };
type Stat = { correct: number; total: number };

export function Challenge({ quizId }: { quizId: string }) {
  const [state, setState] = useState<AttemptState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [reviewSet, setReviewSet] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    api
      .startAttempt(quizId)
      .then((s) => {
        setState(s);
        setReviewSet(new Set(s.reviewListQuestionIds));
        setStats(s.questionStats);
        const initial: Record<string, Feedback> = {};
        for (const a of s.answers) {
          initial[a.questionId] =
            a.type === "short"
              ? {
                  type: "short",
                  isCorrect: a.isCorrect,
                  explanation: a.explanation,
                  submittedText: a.submittedText,
                  acceptedAnswers: a.acceptedAnswers,
                }
              : {
                  type: a.type,
                  isCorrect: a.isCorrect,
                  explanation: a.explanation,
                  selectedChoiceIds: a.selectedChoiceIds,
                  correctChoiceIds: a.correctChoiceIds,
                };
        }
        setFeedback(initial);
        // Resume at the first unanswered question (or the last, if all answered).
        const firstUnanswered = s.quiz.questions.findIndex((q) => !(q.id in initial));
        setIdx(firstUnanswered === -1 ? Math.max(0, s.quiz.questions.length - 1) : firstUnanswered);
      })
      .catch((e) => {
        if (isApiError(e) && e.status === 401) setNeedLogin(true);
        else if (isApiError(e) && e.status === 404) setError("クイズが見つかりません");
        else setError("挑戦の開始に失敗しました");
      });
  }, [quizId]);

  // Stable across renders. Records feedback AND bumps this question's own-accuracy
  // stat locally (so it updates immediately after answering — ADR-0006 activity).
  // MUST be declared before the early returns below (a hook after a conditional
  // return changes the hook count → React error #310).
  const onAnswered = useCallback((questionId: string, fb: Feedback) => {
    setFeedback((prev) => ({ ...prev, [questionId]: fb }));
    setStats((prev) => {
      const s = prev[questionId] ?? { correct: 0, total: 0 };
      return {
        ...prev,
        [questionId]: { correct: s.correct + (fb.isCorrect ? 1 : 0), total: s.total + 1 },
      };
    });
  }, []);

  // Toggle this question's Review List membership (optimistic; reverts on failure).
  // Like onAnswered, declared before the early returns (stable hook order — React #310).
  const onToggleReviewList = useCallback(async (questionId: string, currentlyIn: boolean) => {
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
  }, []);

  if (needLogin)
    return (
      <p>
        挑戦するには <a href="#/login">ログイン</a> が必要です。
      </p>
    );
  if (error) return <p className="error">{error}</p>;
  if (!state) return <p>読み込み中…</p>;

  const questions = state.quiz.questions;
  const answeredCount = Object.keys(feedback).length;
  const total = questions.length;
  const score = Object.values(feedback).filter((f) => f.isCorrect).length;
  const allDone = answeredCount >= total;
  const current = questions[idx];

  return (
    <div>
      <h2>{state.quiz.title}</h2>
      <div className="meta">作者: {state.quiz.authorDisplayName}</div>
      {state.quiz.description ? <QuizMarkdown>{state.quiz.description}</QuizMarkdown> : null}

      <div className="quiz-actions">
        <ReportButton targetType="quiz" targetId={state.quiz.id} label="このクイズを通報" />
      </div>

      <p className="progress">
        進捗: {answeredCount} / {total}
        {allDone ? ` ・ 採点: ${score} / ${total} 正解` : ""}
      </p>

      {current ? (
        <QuestionCard
          key={current.id}
          index={idx}
          question={current}
          attemptId={state.attempt.id}
          feedback={feedback[current.id]}
          stat={stats[current.id]}
          inReviewList={reviewSet.has(current.id)}
          onAnswered={onAnswered}
          onToggleReviewList={onToggleReviewList}
        />
      ) : null}

      <div className="btn-row">
        {idx > 0 ? (
          <button className="link" onClick={() => setIdx((i) => i - 1)}>
            ← 前へ
          </button>
        ) : null}
        {idx < total - 1 ? <button onClick={() => setIdx((i) => i + 1)}>次へ →</button> : null}
      </div>

      {allDone ? (
        <p className="meta">
          全{total}問に回答しました（採点: {score} / {total}）。 <a href="#/">タイムラインへ</a>
        </p>
      ) : null}
    </div>
  );
}

const QuestionCard = memo(function QuestionCard(props: {
  index: number;
  question: PublicQuestion;
  attemptId: string;
  feedback: Feedback | undefined;
  stat: Stat | undefined;
  inReviewList: boolean;
  onAnswered: (questionId: string, fb: Feedback) => void;
  onToggleReviewList: (questionId: string, currentlyIn: boolean) => void;
}) {
  const { question, attemptId, feedback, stat, inReviewList } = props;
  const isShort = question.type === "short";
  const isMulti = question.type === "mcq_multi";
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  // Display-only choice shuffle, re-rolled per presentation: this card remounts on
  // nav (←前へ/次へ→) and reload (key={current.id}), so a fresh order each time, including
  // for already-answered questions. Stable within a mount. Grading is id-based (unaffected).
  // Empty for short (no choices) — harmless.
  const [orderedChoices] = useState(() => shuffle(question.choices));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = feedback !== undefined;
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
      const r = await api.submitAnswer(attemptId, question.id, { choiceIds: selected });
      if (r.reveal.type === "short") return; // unreachable for an mcq question
      props.onAnswered(question.id, {
        type: r.reveal.type,
        isCorrect: r.isCorrect,
        explanation: r.explanation,
        selectedChoiceIds: selected,
        correctChoiceIds: r.reveal.correctChoiceIds,
      });
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
      const r = await api.submitAnswer(attemptId, question.id, { text: trimmed });
      if (r.reveal.type !== "short") return; // unreachable for a short question
      props.onAnswered(question.id, {
        type: "short",
        isCorrect: r.isCorrect,
        explanation: r.explanation,
        submittedText: trimmed,
        acceptedAnswers: r.reveal.acceptedAnswers,
      });
    } catch {
      setError("送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`card question ${locked ? (feedback.isCorrect ? "correct" : "wrong") : ""}`}>
      <div className="q-head">
        <strong>Q{props.index + 1}</strong>
        <span className="badge">{isShort ? "一問一答" : isMulti ? "複数選択" : "単一選択"}</span>
        {locked ? <span className="badge">{feedback.isCorrect ? "正解" : "不正解"}</span> : null}
        <button
          className="link review-toggle"
          onClick={() => props.onToggleReviewList(question.id, inReviewList)}
        >
          {inReviewList ? "★ 復習リスト" : "☆ 復習リストに追加"}
        </button>
      </div>
      <div className="meta">あなたのこの設問の通算正答率: {statText}</div>
      <QuizMarkdown>{question.prompt}</QuizMarkdown>

      {isShort ? (
        <ShortAnswer
          feedback={locked && feedback.type === "short" ? feedback : undefined}
          text={text}
          setText={setText}
          submitting={submitting}
          onSubmit={submitText}
        />
      ) : (
        <ul className="choices">
          {orderedChoices.map((ch) => {
            const reveal = locked && feedback.type !== "short" ? feedback : undefined;
            const chosen = reveal
              ? reveal.selectedChoiceIds.includes(ch.id)
              : selected.includes(ch.id);
            const correct = reveal ? reveal.correctChoiceIds.includes(ch.id) : false;
            return (
              <li
                key={ch.id}
                className={correct ? "choice-correct" : chosen ? "choice-chosen" : ""}
              >
                <label>
                  <input
                    type={isMulti ? "checkbox" : "radio"}
                    name={`q-${question.id}`}
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

      {locked ? (
        feedback.explanation ? (
          <div className="explanation">
            <strong>解説:</strong>
            <QuizMarkdown>{feedback.explanation}</QuizMarkdown>
          </div>
        ) : null
      ) : isShort ? null : (
        <button onClick={submitSelection} disabled={submitting || selected.length === 0}>
          {submitting ? "採点中…" : "回答する"}
        </button>
      )}
    </div>
  );
});

// Short-answer input + post-grade reveal. The accepted answers and the user's text are plain
// text (never markdown — ADR-0012); acceptedAnswers[0] is the canonical form, the rest are 別解.
function ShortAnswer(props: {
  feedback: { isCorrect: boolean; submittedText: string; acceptedAnswers: string[] } | undefined;
  text: string;
  setText: (s: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const { feedback } = props;
  if (feedback) {
    const [canonical, ...alts] = feedback.acceptedAnswers;
    return (
      <div className="short-answer answered">
        <div className="meta">あなたの解答: {feedback.submittedText || "（無回答）"}</div>
        <div>
          正解: <strong>{canonical ?? ""}</strong>
          {alts.length > 0 ? <span className="meta">（別解: {alts.join(" / ")}）</span> : null}
        </div>
      </div>
    );
  }
  return (
    <div className="short-answer">
      <input
        type="text"
        value={props.text}
        placeholder="答えを入力"
        onChange={(e) => props.setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") props.onSubmit();
        }}
      />
      <button
        onClick={props.onSubmit}
        disabled={props.submitting || props.text.trim().length === 0}
      >
        {props.submitting ? "採点中…" : "回答する"}
      </button>
    </div>
  );
}
