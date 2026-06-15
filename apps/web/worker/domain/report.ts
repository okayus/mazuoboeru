// Pure report-domain rules (no I/O). The reason categories + target types are the
// single source of truth, shared by the route's Zod schema (validation) and any
// future moderation logic. Because this is a public service, reporting is throttled
// per user to blunt report-spam (data-model.md, security.md).

export const REPORT_TARGET_TYPES = ["quiz", "question", "user"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASON_CATEGORIES = [
  "spam",
  "sexual",
  "violence",
  "copyright",
  "other",
] as const;
export type ReportReasonCategory = (typeof REPORT_REASON_CATEGORIES)[number];

// Free-text detail cap (chars). Mirrored in the route's Zod schema and the UI textarea.
export const REPORT_REASON_MAX = 500;

// Per-user throttle: at most this many reports in any rolling REPORT_WINDOW_MS window
// (data-model.md: "10 件/日/ユーザ"). A rolling window — not a calendar day — keeps it
// timezone-free and avoids a midnight reset that a burst could ride across.
export const REPORT_RATE_LIMIT = 10;
export const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Given how many reports the user has filed inside the window, are they over quota?
export function isReportRateLimited(recentCount: number): boolean {
  return recentCount >= REPORT_RATE_LIMIT;
}
