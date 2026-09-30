import { afterEach, describe, expect, it, vi } from "vitest";
import { DAILY_DIGEST_CRON, HOURLY_HEARTBEAT_CRON, kokemusuWire, runScheduled } from "./cron";
import type { KokemusuWire } from "./cron";
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

  it("daily tick with URL + PAT but no Service Binding also skips before any I/O", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    // No DB either: reaching the query would throw, and "push failed" would be logged.
    const env = {
      KOKEMUSU_URL: "https://diary.example",
      KOKEMUSU_PAT: "kokemusu_pat_x",
    } as Bindings;
    await expect(runScheduled(controller(DAILY_DIGEST_CRON), env)).resolves.toBeUndefined();
    const logged = log.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("[kokemusu] skipped");
    expect(logged).not.toContain("push failed");
  });
});

// The transport (ADR-0017 補記 2026-09-30): the push must go over the Service Binding,
// never global fetch() — a sibling Worker on the same zone is unreachable that way.
describe("kokemusuWire", () => {
  const env = (overrides: Partial<Bindings>): Bindings =>
    ({
      KOKEMUSU_URL: "https://diary.example",
      KOKEMUSU_PAT: "kokemusu_pat_x",
      KOKEMUSU: { fetch: vi.fn(async () => new Response(null, { status: 201 })) },
      ...overrides,
    }) as Bindings;

  it("sends through the binding's fetch, not the global one", async () => {
    const globalFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("global fetch must not be used"));
    const bindings = env({});
    const wire = kokemusuWire(bindings) as KokemusuWire;
    expect(wire).not.toBeNull();
    expect(wire.url).toBe("https://diary.example");
    expect(wire.token).toBe("kokemusu_pat_x");

    const res = await wire.fetchImpl("https://diary.example/api/posts", { method: "POST" });

    expect(res.status).toBe(201);
    expect(bindings.KOKEMUSU?.fetch).toHaveBeenCalledWith("https://diary.example/api/posts", {
      method: "POST",
    });
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it.each(["KOKEMUSU_URL", "KOKEMUSU_PAT", "KOKEMUSU"] as const)(
    "is null without %s",
    (missing) => {
      const bindings = env({});
      delete bindings[missing];
      expect(kokemusuWire(bindings)).toBeNull();
    },
  );

  it("treats an empty PAT as unset", () => {
    expect(kokemusuWire(env({ KOKEMUSU_PAT: "" }))).toBeNull();
  });
});
