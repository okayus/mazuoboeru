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

// Push yesterday's Daily Digest to kokemusu (ADR-0017). Fail-quiet end to end: unset
// env (local dev, preview) skips before any I/O; a query or network failure logs and
// returns. Nothing here may throw — kokemusu is an optional destination, not a
// dependency of the cron.
async function pushDailyDigest(env: Bindings, nowMs: number): Promise<void> {
  const { KOKEMUSU_URL, KOKEMUSU_PAT } = env;
  if (!KOKEMUSU_URL || !KOKEMUSU_PAT) {
    console.log("[kokemusu] skipped: KOKEMUSU_URL / KOKEMUSU_PAT not set");
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
    await postWithBearer(KOKEMUSU_URL, KOKEMUSU_PAT, post);
  } catch (e) {
    console.log("[kokemusu] push failed:", e instanceof Error ? e.message : String(e));
  }
}
