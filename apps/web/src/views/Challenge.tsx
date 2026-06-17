import { memo, useCallback, useEffect, useState } from "react";
import {
  api,
  type AttemptState,
  isApiError,
  type PublicQuestion,
} from "../api";
import { QuizMarkdown } from "../QuizMarkdown";
import { ReportButton } from "./ReportButton";

type Feedback = {
  isCorrect: boolean;
  correctChoiceIds: string[];
  explanation: string | null;
  selected: string[];
};

export function Challenge({ quizId }: { quizId: string }) {
  const [state, setState] = useState<AttemptState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    api
      .startAttempt(quizId)
      .then((s) => {
        setState(s);
        setFavorited(s.favorited);
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
      })
      .catch((e) => {
        if (isApiError(e) && e.status === 401) setNeedLogin(true);
        else if (isApiError(e) && e.status === 404) setError("クイズが見つかりません");
        else setError("挑戦の開始に失敗しました");
      });
  }, [quizId]);

  // Stable across renders (functional setState needs no deps) so memo(QuestionCard)
  // can skip the sibling cards when one question's feedback changes. MUST be declared
  // before the early returns below: a hook after a conditional return changes the hook
  // count between the first (state===null) and later renders → React error #310.
  const onAnswered = useCallback((questionId: string, fb: Feedback) => {
    setFeedback((prev) => ({ ...prev, [questionId]: fb }));
  }, []);

  if (needLogin)
    return (
      <p>
        挑戦するには <a href="#/login">ログイン</a> が必要です。
      </p>
    );
  if (error) return <p className="error">{error}</p>;
  if (!state) return <p>読み込み中…</p>;

  const answeredCount = Object.keys(feedback).length;
  const total = state.quiz.questions.length;
  const score = Object.values(feedback).filter((f) => f.isCorrect).length;

  const toggleFavorite = async () => {
    try {
      const r = favorited
        ? await api.removeFavorite(state.quiz.id)
        : await api.addFavorite(state.quiz.id);
      setFavorited(r.favorited);
    } catch {
      // non-fatal; leave the toggle as-is
    }
  };

  return (
    <div>
      <h2>{state.quiz.title}</h2>
      <div className="meta">作者: {state.quiz.authorDisplayName}</div>
      {state.quiz.description ? <QuizMarkdown>{state.quiz.description}</QuizMarkdown> : null}

      <div className="quiz-actions">
        <button className="link" onClick={toggleFavorite}>
          {favorited ? "★ my hot 登録済み" : "☆ my hot に登録"}
        </button>
        <ReportButton targetType="quiz" targetId={state.quiz.id} label="このクイズを通報" />
      </div>

      <p className="progress">
        進捗: {answeredCount} / {total}
        {answeredCount >= total ? ` ・ 採点: ${score} / ${total} 正解` : ""}
      </p>

      {state.quiz.questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          index={i}
          question={q}
          attemptId={state.attempt.id}
          feedback={feedback[q.id]}
          onAnswered={onAnswered}
        />
      ))}
    </div>
  );
}

const QuestionCard = memo(function QuestionCard(props: {
  index: number;
  question: PublicQuestion;
  attemptId: string;
  feedback: Feedback | undefined;
  onAnswered: (questionId: string, fb: Feedback) => void;
}) {
  const { question, attemptId, feedback } = props;
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMulti = question.type === "mcq_multi";
  const locked = feedback !== undefined;

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
        {locked ? (
          <span className="badge">{feedback.isCorrect ? "正解" : "不正解"}</span>
        ) : null}
      </div>
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
