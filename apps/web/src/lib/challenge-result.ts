// Challenge Result (挑戦結果) — the on-screen summary of one full pass through a quiz-scoped
// Drill (CONTEXT.md Challenge Result; ADR-0013 addendum 2026-09-13). Pure: the parent view
// collects one entry per question as the card reports each graded answer, and this module
// turns that list into what the result screen shows. Nothing here is persisted — there is no
// per-run row on the server (ADR-0013); leaving or reloading the page discards the pass.

export type ResultItem = {
  questionId: string;
  type: "mcq_single" | "mcq_multi" | "short";
  prompt: string;
  choices: { id: string; text: string; position: number }[];
};

// What the card learned when this question was graded: the server's reveal (correct ids /
// accepted answers + explanation) and what the learner submitted. Mirrors the card's Feedback.
export type ResultFeedback =
  | {
      type: "mcq_single" | "mcq_multi";
      isCorrect: boolean;
      explanation: string | null;
      chosenChoiceIds: string[];
      correctChoiceIds: string[];
    }
  | {
      type: "short";
      isCorrect: boolean;
      explanation: string | null;
      submittedText: string;
      acceptedAnswers: string[];
    };

// One answered question of the pass, in presentation order (the per-mount shuffle order).
export type ResultEntry = { item: ResultItem; feedback: ResultFeedback };

export type ChallengeSummary = {
  correct: number;
  total: number;
  // Rounded to a whole percent, like the card's all-time accuracy text. 0 when total is 0.
  percent: number;
  // Grouped wrong-first (what to learn comes first); each group keeps presentation order.
  wrong: ResultEntry[];
  right: ResultEntry[];
};

export function summarizeChallenge(entries: readonly ResultEntry[]): ChallengeSummary {
  const wrong = entries.filter((e) => !e.feedback.isCorrect);
  const right = entries.filter((e) => e.feedback.isCorrect);
  const total = entries.length;
  const correct = right.length;
  return {
    correct,
    total,
    percent: total === 0 ? 0 : Math.round((correct / total) * 100),
    wrong,
    right,
  };
}

// The texts to show as 正解. mcq: the correct choices in the author's `position` order (the
// display shuffle is cosmetic and never persisted — #61); short: [canonical, ...alternates]
// (ADR-0012 — accept[0] is the canonical answer).
export function correctAnswerTexts(entry: ResultEntry): string[] {
  const { item, feedback } = entry;
  if (feedback.type === "short") return feedback.acceptedAnswers;
  return choiceTexts(item, feedback.correctChoiceIds);
}

// The texts to show as あなたの答え. mcq: the chosen choices in `position` order; short: the
// submitted text as typed (before normalization — the learner should see their own input).
export function submittedAnswerTexts(entry: ResultEntry): string[] {
  const { item, feedback } = entry;
  if (feedback.type === "short") return [feedback.submittedText];
  return choiceTexts(item, feedback.chosenChoiceIds);
}

function choiceTexts(item: ResultItem, ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  return [...item.choices]
    .sort((a, b) => a.position - b.position)
    .filter((ch) => wanted.has(ch.id))
    .map((ch) => ch.text);
}
