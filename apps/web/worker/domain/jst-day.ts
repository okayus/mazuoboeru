// The canonical JST calendar-day boundary (ADR-0006): every "day" in this app —
// streak, activity, the Daily Digest window (ADR-0017) — is a JST calendar day.
// Japan has no DST, so a fixed +9h offset is exact and independent of the
// environment's timezone.

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Epoch ms → JST calendar-day index.
export function jstDay(ms: number): number {
  return Math.floor((ms + JST_OFFSET_MS) / DAY_MS);
}

// The epoch-ms window [startMs, endMs) and calendar date ("YYYY-MM-DD") of the JST
// day that finished most recently before `nowMs` — for the 00:15 JST daily tick
// that's the whole previous day, so a 23:59 answer is never lost to the digest.
export function previousJstDayWindow(nowMs: number): {
  startMs: number;
  endMs: number;
  date: string;
} {
  const day = jstDay(nowMs) - 1;
  const startMs = day * DAY_MS - JST_OFFSET_MS;
  return {
    startMs,
    endMs: startMs + DAY_MS,
    // day*DAY_MS is 00:00 UTC of the calendar date that JST day carries.
    date: new Date(day * DAY_MS).toISOString().slice(0, 10),
  };
}
