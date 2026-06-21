// Short-answer (一問一答) grading + storage helpers (ADR-0012). The challenger types a
// free-text answer; the server grades it by Answer Normalization on BOTH sides, then exact
// match against the author's Accepted Answer set. Mechanical noise only (NFKC, case,
// whitespace) — semantic variants (kana, synonyms) live in the accept list, not here. No
// fuzzy / edit-distance matching. Pure; server-authoritative (ADR-0010).

// Authoring limits (shared by the route zod + the publish gate so the wire + the gate agree).
export const MAX_ACCEPTED_ANSWERS = 10;
export const MAX_ANSWER_LEN = 200;

// Answer Normalization (CONTEXT.md): fold only mechanical noise so trivially-different
// inputs match. NFKC maps full-width latin/compat chars (and U+3000) to their canonical
// forms; trim + collapse runs of whitespace; lowercase is locale-independent (predictable
// across the Workers runtime — no Turkish-i surprises). Order: normalize → trim → collapse
// → lowercase (lowercase never reintroduces whitespace).
export function normalizeAnswer(s: string): string {
  return s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

// Correct iff the normalized input equals some normalized accepted answer. Empty input (or
// input that normalizes to empty) is never correct — mirrors "empty selection is incorrect"
// in gradeSelection.
export function gradeShortAnswer(accept: readonly string[], input: string): boolean {
  const norm = normalizeAnswer(input);
  if (norm.length === 0) return false;
  return accept.some((a) => normalizeAnswer(a) === norm);
}

// --- Storage shape: question.answer holds JSON {"accept":[raw,...]} (ADR-0012) ---

// Serialize the author's raw accepted answers for the question.answer column. Stored RAW
// (not normalized) so the canonical form (accept[0]) stays human-readable in feedback and
// the normalization rules can evolve without a data migration.
export function serializeAcceptedAnswers(accept: readonly string[]): string {
  return JSON.stringify({ accept });
}

// Defensive parse of the question.answer cell → the raw accepted-answer list. Returns [] for
// NULL / malformed JSON / wrong shape (a corrupt cell is treated as "no answer", never
// thrown — same hardening posture as lib/json.ts parseStringArray). cloze later branches on
// question.type to read {"blanks":[...]} instead.
export function parseAcceptedAnswers(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === "object" && "accept" in parsed) {
      const a = (parsed as { accept: unknown }).accept;
      return Array.isArray(a) ? a.filter((s): s is string => typeof s === "string") : [];
    }
    return [];
  } catch {
    return [];
  }
}
