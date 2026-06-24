import { type ReactNode, useState } from "react";
import { api, type AnswerSubmission } from "../api";
import { shuffle } from "../lib/shuffle";
import { QuizMarkdown } from "../QuizMarkdown";

export type Stat = { correct: number; total: number };

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

// The minimal question shape the card renders. Both the Review List Drill (GET /drill) and the
// quiz-scoped Drill (GET /drill/quiz/:id) return this — the card is unaware which pool it came
// from. is_correct is never present (server-authoritative grading; ADR-0010).
export type DrillCardItem = {
  questionId: string;
  type: "mcq_single" | "mcq_multi" | "short";
  prompt: string;
  choices: { id: string; text: string; position: number }[];
};

// One drillable question: render the prompt + choices (mcq) or a text input (short), submit to
// the shared POST /drill/answers grader (ADR-0010), then show Immediate Feedback (CONTEXT.md).
// The card owns only the answer interaction; the surrounding affordances vary per pool, so the
// caller injects them: `source` (e.g. 出典 link), `headerExtra` (e.g. the ☆ Review List toggle),
// and `actions` (post-answer footer — graduate/keep for the Review List, 次へ for a quiz).
// Choice display order is shuffled per mount; grading is id-based so order never affects it (#61).
export function DrillQuestionCard(props: {
  item: DrillCardItem;
  stat: Stat | undefined;
  source?: ReactNode;
  headerExtra?: ReactNode;
  onAnswered: (questionId: string, isCorrect: boolean) => void;
  actions: ReactNode;
}) {
  const { item, stat, source, headerExtra } = props;
  const isShort = item.type === "short";
  const isMulti = item.type === "mcq_multi";
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  // Display-only choice shuffle, fixed for this mount (empty for short — harmless).
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

  const submit = async (submission: AnswerSubmission) => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.submitDrillAnswer(item.questionId, submission);
      setFeedback(
        r.reveal.type === "short"
          ? {
              type: "short",
              isCorrect: r.isCorrect,
              explanation: r.explanation,
              submittedText: "text" in submission ? submission.text : "",
              acceptedAnswers: r.reveal.acceptedAnswers,
            }
          : {
              type: r.reveal.type,
              isCorrect: r.isCorrect,
              explanation: r.explanation,
              correctChoiceIds: r.reveal.correctChoiceIds,
            },
      );
      props.onAnswered(item.questionId, r.isCorrect);
    } catch {
      setError("送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const submitSelection = () => {
    if (selected.length > 0) void submit({ choiceIds: selected });
  };
  const submitText = () => {
    const trimmed = text.trim();
    if (trimmed.length > 0) void submit({ text: trimmed });
  };

  return (
    <div className={`card question ${locked ? (feedback.isCorrect ? "correct" : "wrong") : ""}`}>
      <div className="q-head">
        <span className="badge">{isShort ? "一問一答" : isMulti ? "複数選択" : "単一選択"}</span>
        {locked ? <span className="badge">{feedback.isCorrect ? "正解" : "不正解"}</span> : null}
        {headerExtra}
      </div>
      <div className="meta">
        {source ? <>{source} ・ </> : null}この設問の通算正答率: {statText}
      </div>
      <QuizMarkdown>{item.prompt}</QuizMarkdown>

      {isShort ? (
        locked && feedback.type === "short" ? (
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
                    name={`q-${item.questionId}`}
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
          {props.actions}
        </>
      )}
    </div>
  );
}
