// Daily Digest → kokemusu post, as a pure builder (CONTEXT.md Daily Digest, ADR-0017).
// Service-wide aggregates + published-quiz titles only — never per-user data: who
// answered what stays private (docs/security.md), so counts are the finest grain here.

export type DailyResults = {
  // The reported JST calendar day, "YYYY-MM-DD" (previousJstDayWindow — the day the
  // activity was queried over, NOT the send time).
  date: string;
  answers: { total: number; correct: number; answerers: number };
  // Published during the day and still publicly visible at send time, in publish order.
  publishedQuizzes: { id: string; title: string }[];
};

export type KokemusuPost = { title: string; body: string; tags: string[] };

// The receiver's write contract: body ≤20,000 chars, title ≤200, ≤20 tags. The
// builder stays far below the caps by construction and clamps body defensively.
const BODY_MAX = 20_000;
const LIST_MAX = 20;

// Provenance: the receiver doesn't know its callers, so the sender names itself
// via tags (ADR-0017).
const TAGS = ["mazuoboeru"];

// null = nothing happened that day — post nothing (no empty stones in the diary).
export function buildDailyKokemusuPost(results: DailyResults, origin: string): KokemusuPost | null {
  const { answers, publishedQuizzes } = results;
  if (answers.total === 0 && publishedQuizzes.length === 0) return null;

  const lines: string[] = [];
  if (answers.total > 0) {
    const pct = Math.round((answers.correct / answers.total) * 100);
    lines.push(
      `- 回答: ${answers.total}問（正答 ${answers.correct}・${pct}%・回答者 ${answers.answerers}人）`,
    );
  }
  if (publishedQuizzes.length > 0) {
    lines.push(`- 公開: ${publishedQuizzes.length}件`);
    for (const q of publishedQuizzes.slice(0, LIST_MAX)) {
      lines.push(`  - [${linkText(q.title)}](${origin}/#/quiz/${q.id})`);
    }
    const rest = publishedQuizzes.length - LIST_MAX;
    if (rest > 0) lines.push(`  - …他 ${rest} 件`);
  }

  return {
    title: `まず覚える ${results.date}`,
    body: clampBody(lines.join("\n")),
    tags: TAGS,
  };
}

// Quiz titles are UGC: collapse whitespace (a newline would break the bullet) and
// escape the brackets that would terminate the Markdown link text early. Rendering
// safety beyond that is the receiver's concern (it sanitizes its own Markdown).
function linkText(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([[\]])/g, "\\$1");
}

function clampBody(body: string): string {
  return body.length <= BODY_MAX ? body : `${body.slice(0, BODY_MAX - 1)}…`;
}
