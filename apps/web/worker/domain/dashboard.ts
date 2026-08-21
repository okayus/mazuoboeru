// Private learning-dashboard metrics — pure, per-answer, activity-framed (ADR-0006).
// All counts are over the user's own `answer` rows (re-attempts included). No I/O.

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Epoch ms → JST calendar-day index (ADR-0006: the streak day boundary is JST).
function jstDay(ms: number): number {
  return Math.floor((ms + JST_OFFSET_MS) / DAY_MS);
}

// Consecutive JST days with >=1 answer. `current` is the run ending at the most recent
// active day, alive only if that day is today or yesterday (grace until end of today);
// `longest` is the longest run ever.
export function computeStreak(
  answeredAtMs: number[],
  nowMs: number,
): { current: number; longest: number } {
  if (answeredAtMs.length === 0) return { current: 0, longest: 0 };
  const days = [...new Set(answeredAtMs.map(jstDay))].sort((a, b) => a - b);

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const cur = days[i] as number;
    const prev = days[i - 1] as number;
    run = cur === prev + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const today = jstDay(nowMs);
  const last = days[days.length - 1] as number;
  let current = 0;
  if (last === today || last === today - 1) {
    current = 1;
    for (let i = days.length - 1; i > 0; i--) {
      if ((days[i] as number) === (days[i - 1] as number) + 1) current++;
      else break;
    }
  }
  return { current, longest };
}

export type AnswerFact = { isCorrect: boolean; quizId: string };
export type TagBucket = { correct: number; total: number };

// Bundle answers by the AUTHORED tags of their quiz (ADR-0006 as amended by ADR-0016:
// tags are flat, nothing rolls up). An answer counts toward every tag of its quiz, so
// per-tag totals can exceed the overall answer count by design. Answers whose quiz has no
// tags go to the untagged bucket. Keyed by tag id (the caller resolves display names).
export function bundleTagAccuracy(
  answers: AnswerFact[],
  tagIdsByQuiz: Map<string, string[]>,
): { byTagId: Map<string, TagBucket>; untagged: TagBucket } {
  const byTagId = new Map<string, TagBucket>();
  const untagged: TagBucket = { correct: 0, total: 0 };

  const add = (b: TagBucket, correct: boolean) => {
    b.total++;
    if (correct) b.correct++;
  };

  for (const a of answers) {
    const tags = [...new Set(tagIdsByQuiz.get(a.quizId) ?? [])];
    if (tags.length === 0) {
      add(untagged, a.isCorrect);
    } else {
      for (const tid of tags) {
        const b = byTagId.get(tid) ?? { correct: 0, total: 0 };
        add(b, a.isCorrect);
        byTagId.set(tid, b);
      }
    }
  }
  return { byTagId, untagged };
}

// Bundle answers by their quiz — the per-quiz dashboard axis (ADR-0013). Unlike tags,
// each answer counts toward exactly ONE quiz (its question's quiz), so the per-quiz totals sum to
// the overall answer count. Keyed by quizId (the caller resolves titles). Reuses TagBucket as the
// plain {correct,total} counter.
export function bundleQuizAccuracy(answers: AnswerFact[]): Map<string, TagBucket> {
  const byQuiz = new Map<string, TagBucket>();
  for (const a of answers) {
    const b = byQuiz.get(a.quizId) ?? { correct: 0, total: 0 };
    b.total++;
    if (a.isCorrect) b.correct++;
    byQuiz.set(a.quizId, b);
  }
  return byQuiz;
}
