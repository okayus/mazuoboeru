import {
  correctAnswerTexts,
  type ResultEntry,
  submittedAnswerTexts,
  summarizeChallenge,
} from "../lib/challenge-result";
import { QuizMarkdown } from "../QuizMarkdown";

// Challenge Result (挑戦結果): shown once every question of a quiz-scoped Drill has been answered
// (CONTEXT.md Challenge Result; ADR-0013 addendum 2026-09-13). Purely derived from what the cards
// reported during this pass — nothing is fetched or stored, and it vanishes with the page (the
// answers themselves were recorded one by one as they were graded). Wrong questions come first
// (what to learn next), each group in the order the questions were shown. Prompts are other
// users' Markdown → the sanitized QuizMarkdown path (ADR-0004); choice texts are plain text.
export function ChallengeResult(props: {
  entries: readonly ResultEntry[];
  isInReviewList: (questionId: string) => boolean;
  onToggleReviewList: (questionId: string, currentlyIn: boolean) => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const summary = summarizeChallenge(props.entries);
  const groups = [
    { title: "間違えた設問", entries: summary.wrong },
    { title: "正解した設問", entries: summary.right },
  ].filter((g) => g.entries.length > 0);

  return (
    <div className="challenge-result">
      <div className="card">
        <p>おつかれさま！ このクイズの挑戦は終わりです。</p>
        <p className="progress result-headline">
          {summary.correct} / {summary.total} 問正解（{summary.percent}%）
        </p>
        <div className="btn-row">
          <button onClick={props.onRetry} disabled={props.retrying}>
            {props.retrying ? "準備中…" : "もう一度挑戦"}
          </button>
          <span className="meta">
            <a href="#/">タイムライン</a> ／ <a href="#/dashboard">ダッシュボード</a>
          </span>
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.title}>
          <h3>
            {g.title}（{g.entries.length}）
          </h3>
          {g.entries.map((entry) => (
            <ResultRow
              key={entry.item.questionId}
              entry={entry}
              inReviewList={props.isInReviewList(entry.item.questionId)}
              onToggleReviewList={props.onToggleReviewList}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function ResultRow({
  entry,
  inReviewList,
  onToggleReviewList,
}: {
  entry: ResultEntry;
  inReviewList: boolean;
  onToggleReviewList: (questionId: string, currentlyIn: boolean) => void;
}) {
  const { item, feedback } = entry;
  const correct = correctAnswerTexts(entry);
  const submitted = submittedAnswerTexts(entry);
  const explanation = feedback.explanation?.trim();

  return (
    <div className={`card question result-row ${feedback.isCorrect ? "correct" : "wrong"}`}>
      <div className="q-head">
        <span className="badge">{feedback.isCorrect ? "正解" : "不正解"}</span>
        <button
          className="link review-toggle"
          onClick={() => onToggleReviewList(item.questionId, inReviewList)}
        >
          {inReviewList ? "★ 復習リスト" : "☆ 復習リストに追加"}
        </button>
      </div>
      <QuizMarkdown>{item.prompt}</QuizMarkdown>
      <div className="result-answers">
        {!feedback.isCorrect ? (
          <div className="meta">あなたの答え: {submitted.join(" / ") || "（無回答）"}</div>
        ) : null}
        {feedback.type === "short" ? (
          <div>
            正解: <strong>{correct[0] ?? ""}</strong>
            {correct.length > 1 ? (
              <span className="meta">（別解: {correct.slice(1).join(" / ")}）</span>
            ) : null}
          </div>
        ) : (
          <div>
            正解: <strong>{correct.join(" / ")}</strong>
          </div>
        )}
      </div>
      {explanation ? (
        <details className="explanation">
          <summary>解説</summary>
          <QuizMarkdown>{explanation}</QuizMarkdown>
        </details>
      ) : null}
    </div>
  );
}
