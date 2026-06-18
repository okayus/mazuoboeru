import { memo, useCallback, useEffect, useState } from "react";
import { api, type AttemptState, isApiError, type PublicQuestion } from "../api";
import { QuizMarkdown } from "../QuizMarkdown";
import { ReportButton } from "./ReportButton";

type Feedback = {
  isCorrect: boolean;
  correctChoiceIds: string[];
  explanation: string | null;
  selected: string[];
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
          initial[a.questionId] = {
            isCorrect: a.isCorrect,
            correctChoiceIds: a.correctChoiceIds,
            explanation: a.explanation,
            selected: a.selectedChoiceIds,
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
        {idx < total - 1 ? (
          <button onClick={() => setIdx((i) => i + 1)}>次へ →</button>
        ) : null}
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
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMulti = question.type === "mcq_multi";
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

  const submit = async () => {
    if (selected.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.submitAnswer(attemptId, question.id, selected);
      props.onAnswered(question.id, {
        isCorrect: r.isCorrect,
        correctChoiceIds: r.correctChoiceIds,
        explanation: r.explanation,
        selected,
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
        <span className="badge">{isMulti ? "複数選択" : "単一選択"}</span>
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

      <ul className="choices">
        {question.choices.map((ch) => {
          const chosen = locked ? feedback.selected.includes(ch.id) : selected.includes(ch.id);
          const correct = locked && feedback.correctChoiceIds.includes(ch.id);
          return (
            <li key={ch.id} className={correct ? "choice-correct" : chosen ? "choice-chosen" : ""}>
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

      {error ? <p className="error">{error}</p> : null}

      {locked ? (
        feedback.explanation ? (
          <div className="explanation">
            <strong>解説:</strong>
            <QuizMarkdown>{feedback.explanation}</QuizMarkdown>
          </div>
        ) : null
      ) : (
        <button onClick={submit} disabled={submitting || selected.length === 0}>
          {submitting ? "採点中…" : "回答する"}
        </button>
      )}
    </div>
  );
});
