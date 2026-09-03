import { afterEach, describe, expect, it, vi } from "vitest";
import { DAILY_DIGEST_CRON, HOURLY_HEARTBEAT_CRON, runScheduled } from "./cron";
import type { Bindings } from "./types";

// The env stub has no DB and no KOKEMUSU_* — so these tests also prove the guard
// order: the daily push must bail on missing env BEFORE any I/O is attempted.
const controller = (cron: string): ScheduledController =>
  ({
    cron,
    scheduledTime: Date.parse("2026-09-03T15:15:00Z"),
    noRetry: () => {},
  }) as ScheduledController;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runScheduled", () => {
  it("hourly heartbeat never goes near kokemusu", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runScheduled(controller(HOURLY_HEARTBEAT_CRON), {} as Bindings);
    expect(log.mock.calls.flat().map(String).join(" ")).not.toContain("kokemusu");
  });

  it("daily tick without KOKEMUSU env skips quietly before any I/O", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      runScheduled(controller(DAILY_DIGEST_CRON), {} as Bindings),
    ).resolves.toBeUndefined();
    expect(log.mock.calls.flat().map(String).join(" ")).toContain("[kokemusu] skipped");
  });
});
