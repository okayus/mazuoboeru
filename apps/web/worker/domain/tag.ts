// Pure tag normalization — no I/O. A tag's identity is its `key`
// (NFKC + trimmed + internal whitespace collapsed + ASCII-lowercased); `name`
// preserves display casing. So "Docker"/"DOCKER"/"docker" share one key but the
// first-seen display form is kept. See docs/data-model.md / ADR-0006.

export type NormalizedTag = { name: string; key: string };

export const MAX_TAG_LEN = 30;
// Generous ceiling rather than a literal "unlimited": with the tag DAG (ADR-0007),
// broader tags are derived automatically, so few authored tags are needed; this bounds
// pathological tag-spam without constraining real use. Real spam controls (rate limit)
// are deferred (additive). Effective tags (the upward closure) are unbounded.
export const MAX_TAGS_PER_QUIZ = 30;

// Normalize one raw tag. Returns null when empty or too long after normalization —
// callers drop nulls rather than erroring on a stray blank chip.
export function normalizeTag(raw: string): NormalizedTag | null {
  const name = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > MAX_TAG_LEN) return null;
  return { name, key: name.toLowerCase() };
}

// Normalize a list: drop invalid, dedupe by key (first occurrence wins so its
// display casing is kept), cap at MAX_TAGS_PER_QUIZ.
export function parseTags(raw: string[]): NormalizedTag[] {
  const out: NormalizedTag[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const t = normalizeTag(r);
    if (!t || seen.has(t.key)) continue;
    seen.add(t.key);
    out.push(t);
    if (out.length >= MAX_TAGS_PER_QUIZ) break;
  }
  return out;
}
