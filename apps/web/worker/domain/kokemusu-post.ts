// Daily Digest → kokemusu post, as a pure builder (CONTEXT.md Daily Digest, ADR-0017).
// Service-wide aggregates + published-quiz titles only — never per-user data: who
// answered what stays private (docs/security.md), so counts are the finest grain here.
//
// The receiver's contract is NOT transcribed here (ADR-0017 補記, 2026-09-09): it is
// kokemusu's docs/senders.md, and kokemusu-posts.schema.json next to this file is
// the vendored copy the tests check the builder's output against. Refresh it with
// `pnpm kokemusu:schema` (a curl of kokemusu's public repo — reachable from the
// sandbox); a change there shows up as a failing test here, not as a 400 at 00:15.

export type DailyResults = {
  // The reported JST calendar day, "YYYY-MM-DD" (previousJstDayWindow — the day the
  // activity was queried over, NOT the send time).
  date: string;
  answers: { total: number; correct: number; answerers: number };
  // Published during the day and still publicly visible at send time, in publish order.
  publishedQuizzes: { id: string; title: string }[];
};

// What goes on the wire: the Markdown body, the provenance tags, and the JST day the
// digest is ABOUT (`firstDay`), so the 苔片 lands on that day rather than on the
// 00:15 send day. No `title`: the receiver retired the 見出し (kokemusu ADR-0006) and
// refuses unknown keys — the tag and the day carry what the title used to say.
export type KokemusuPost = { body: string; tags: string[]; firstDay: string };

// The receiver's body cap (schema.json maxLength). The builder stays far below it
// by construction and clamps defensively.
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

  return { body: clampBody(lines.join("\n")), tags: TAGS, firstDay: results.date };
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
