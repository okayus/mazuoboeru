// Defensive parse of a TEXT column that stores a JSON array of strings — e.g.
// api_token.scopes and attempt_answer.response. Returns [] on malformed JSON or a
// non-array shape: a corrupt cell is treated as "empty", never thrown. This is the
// single hardening point for the JSON-array column boundary (previously duplicated
// byte-for-byte as parseScopes / parseResponse).
export function parseStringArray(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

// Defensive parse of a TEXT column that stores a single JSON string — the short-answer
// branch of attempt_answer.response (mcq stores a JSON array of choice ids; short stores
// JSON.stringify of the typed text). Returns "" on malformed JSON or a non-string shape;
// never throws.
export function parseStoredText(json: string): string {
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return "";
  }
}
