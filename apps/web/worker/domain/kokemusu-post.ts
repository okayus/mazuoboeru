// Daily Digest → kokemusu post, as a pure builder (CONTEXT.md Daily Digest, ADR-0017).
// Service-wide aggregates, published-quiz titles and the day's quiz tags only — never
// per-user data: who answered what stays private (docs/security.md), so counts are the
// finest grain here.
//
// The receiver's contract is NOT transcribed here (ADR-0017 補記, 2026-09-09): it is
// kokemusu's docs/senders.md, and kokemusu-posts.schema.json next to this file is
// the vendored copy the tests check the builder's output against — and where the
// caps below are read from. Refresh it with `pnpm kokemusu:schema` (a curl of
// kokemusu's public repo — reachable from the sandbox); a change there shows up as a
// failing test (or a type error) here, not as a 400 at 00:15.

import schema from "./kokemusu-posts.schema.json";
import { normalizeTag } from "./tag";

export type DailyResults = {
  // The reported JST calendar day, "YYYY-MM-DD" (previousJstDayWindow — the day the
  // activity was queried over, NOT the send time).
  date: string;
  answers: { total: number; correct: number; answerers: number };
  // Published during the day and still publicly visible at send time, in publish order.
  publishedQuizzes: { id: string; title: string }[];
  // The day's quiz tags (CONTEXT.md Daily Digest), from the two things the day did:
  // tags on the still-public quizzes the day's answers landed on, each with how many of
  // those answers its quizzes took (the rank when the receiver's cap bites), and tags
  // on the quizzes published that day (rank 0 unless they were answered too).
  answeredTags: { name: string; answers: number }[];
  publishedTags: string[];
};

// What goes on the wire: the Markdown body, the tags (provenance first), the 向き, and
// the JST day the digest is ABOUT (`firstDay`), so the 苔片 lands on that day rather
// than on the 00:15 send day. No `title`: the receiver retired the 見出し (kokemusu
// ADR-0006) and refuses unknown keys — the tag and the day carry what it used to say.
export type KokemusuPost = { body: string; tags: string[]; kind: "both"; firstDay: string };

// The receiver's caps, read off its published schema rather than typed here (ADR-0017
// 補記 2026-09-11): raising them is a kokemusu change plus a re-vendor, and should the
// receiver drop a cap altogether this stops compiling instead of going unbounded.
const BODY_MAX: number = schema.properties.body.maxLength;
const TAGS_MAX: number = schema.properties.tags.maxItems;
// Published-quiz lines in the body — the sender's own editorial choice, not a contract.
const LIST_MAX = 20;

// Provenance: the receiver doesn't know its callers, so the sender names itself via a
// tag (ADR-0017) — the app's own name, the one the diary's owner reads (補記 2026-09-11).
export const PROVENANCE_TAG = "まず覚える";
const PROVENANCE_KEY = normalizeTag(PROVENANCE_TAG)?.key;

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
    body: clampBody(lines.join("\n")),
    tags: digestTags(results),
    // 向き: a study day both takes in and puts out, so the digest is always `both` —
    // varying it with the day's mix would carry no information (補記 2026-09-11).
    kind: "both",
    firstDay: results.date,
  };
}

// The digest's tag set: the provenance tag first, then the tags on the day's answered
// and published quizzes — one entry per tag (tag identity is its normalized key, like
// the quiz side's), a tag both answered and published keeps its answer count. The
// order is deterministic so that when the receiver's cap bites, what survives is
// explainable: most-answered first, ties by name (code-unit order), published-only
// tags (0 answers) last. The provenance tag never falls off.
export function digestTags(
  results: Pick<DailyResults, "answeredTags" | "publishedTags">,
): string[] {
  const byKey = new Map<string, { name: string; answers: number }>();
  const add = (name: string, answers: number) => {
    const key = normalizeTag(name)?.key;
    if (!key || key === PROVENANCE_KEY) return; // a quiz tagged with the app's name is the same stone
    const cur = byKey.get(key);
    if (cur) cur.answers += answers;
    else byKey.set(key, { name, answers });
  };
  for (const t of results.answeredTags) add(t.name, t.answers);
  for (const name of results.publishedTags) add(name, 0);

  const ranked = [...byKey.values()]
    .sort((a, b) => b.answers - a.answers || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((t) => t.name);
  return [PROVENANCE_TAG, ...ranked].slice(0, TAGS_MAX);
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
