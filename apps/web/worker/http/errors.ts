// The closed vocabulary of API error codes returned as `{ error: ApiErrorCode }`.
// One union shared by the server (a typo'd code fails to compile via apiError()) and
// the client (ApiError.body is typed with it, so views can branch on the code).
// Mirrors the domain/report.ts const-tuple → union pattern.
export const API_ERROR_CODES = [
  "cannot_report_self",
  "cannot_restructure_published",
  "csrf_origin_mismatch",
  "insufficient_scope",
  "invalid_body",
  "invalid_choice",
  "not_allowed_creator",
  "not_draft",
  "not_found",
  "not_publishable",
  "rate_limited",
  "session_required",
  "target_not_found",
  "unauthorized",
  "unknown_question",
  "wrong_answer_type",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

// The error envelope. Some routes add detail fields (issues / errors / scope); those
// stay structurally `{ error: ApiErrorCode, ... }` so the client's Exclude-based
// success extraction still drops them.
export type ApiErrorBody = { error: ApiErrorCode };

// Build a typed error body for c.json(apiError(code), status). `code` is checked
// against ApiErrorCode (catches typos that would otherwise silently change the wire
// contract). `extra` carries optional detail (issues / errors / scope). c.json keeps
// the literal status, so Hono RPC response inference is unaffected.
export function apiError<E extends Record<string, unknown>>(
  code: ApiErrorCode,
  extra?: E,
): { error: ApiErrorCode } & E {
  return { error: code, ...(extra ?? ({} as E)) };
}
