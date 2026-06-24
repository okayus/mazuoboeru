// Defensive parse of a TEXT column that stores a JSON array of strings — e.g.
// api_token.scopes. Returns [] on malformed JSON or a non-array shape: a corrupt cell
// is treated as "empty", never thrown. The single hardening point for the JSON-array
// column boundary.
export function parseStringArray(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}
