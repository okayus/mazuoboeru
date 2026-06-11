import type { Bindings } from "./types";

export async function runScheduled(
  event: ScheduledController,
  env: Bindings,
): Promise<void> {
  console.log("[cron] fired at", new Date(event.scheduledTime).toISOString());
  // Implement Cron logic in a later phase (see the cloudflare-cron-to-discord skill).
}
