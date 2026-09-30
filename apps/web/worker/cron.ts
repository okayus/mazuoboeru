import { loadDailyActivity } from "./db/daily-digest-queries";
import { previousJstDayWindow } from "./domain/jst-day";
import { buildDailyKokemusuPost } from "./domain/kokemusu-post";
import { postWithBearer } from "./kokemusu";
import type { Bindings } from "./types";

// Cron expressions (UTC — wrangler.jsonc `triggers.crons` must list exactly these;
// the handler dispatches on the expression string in `event.cron`).
// 15:15 UTC = 00:15 JST: the daily tick fires just after the JST day closes, so the
// Daily Digest reports the completed previous day (domain/jst-day.ts, ADR-0017).
export const HOURLY_HEARTBEAT_CRON = "15 * * * *";
export const DAILY_DIGEST_CRON = "15 15 * * *";

export async function runScheduled(event: ScheduledController, env: Bindings): Promise<void> {
  console.log(`[cron] fired at ${new Date(event.scheduledTime).toISOString()} (${event.cron})`);
  if (event.cron === DAILY_DIGEST_CRON) await pushDailyDigest(env, event.scheduledTime);
}

// Everything the push needs from the env, or null when any piece is missing — the
// fail-quiet gate of ADR-0017 §5. The Service Binding is one of the pieces (補記
// 2026-09-30): kokemusu is a sibling Worker on the same workers.dev zone, which global
// fetch() cannot reach (Cloudflare error 1042 — the flag meant to lift that never
// delivered a single stone), so the request travels over env.KOKEMUSU instead. The
// URL still names the endpoint inside kokemusu; the binding only carries the request.
// Exported for the test: with no D1 in reach, the transport is the one thing to pin.
export type KokemusuWire = { url: string; token: string; fetchImpl: typeof fetch };

export function kokemusuWire(env: Bindings): KokemusuWire | null {
  const { KOKEMUSU_URL, KOKEMUSU_PAT, KOKEMUSU } = env;
  if (!KOKEMUSU_URL || !KOKEMUSU_PAT || !KOKEMUSU) return null;
  return {
    url: KOKEMUSU_URL,
    token: KOKEMUSU_PAT,
    fetchImpl: (input, init) => KOKEMUSU.fetch(input, init),
  };
}

// Push yesterday's Daily Digest to kokemusu (ADR-0017). Fail-quiet end to end: unset
// env or binding (local dev, e2e, preview) skips before any I/O; a query or network
// failure logs and returns. Nothing here may throw — kokemusu is an optional
// destination, not a dependency of the cron.
async function pushDailyDigest(env: Bindings, nowMs: number): Promise<void> {
  const wire = kokemusuWire(env);
  if (!wire) {
    console.log("[kokemusu] skipped: KOKEMUSU_URL / KOKEMUSU_PAT / KOKEMUSU binding not set");
    return;
  }
  try {
    const window = previousJstDayWindow(nowMs);
    const activity = await loadDailyActivity(env, window);
    const post = buildDailyKokemusuPost({ ...activity, date: window.date }, env.ORIGIN);
    if (!post) {
      console.log(`[kokemusu] skipped: no activity on ${window.date}`);
      return;
    }
    await postWithBearer(wire.url, wire.token, post, wire.fetchImpl);
  } catch (e) {
    console.log("[kokemusu] push failed:", e instanceof Error ? e.message : String(e));
  }
}
