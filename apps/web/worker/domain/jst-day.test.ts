import { describe, expect, it } from "vitest";
import { jstDay, previousJstDayWindow } from "./jst-day";

const utc = (s: string): number => Date.parse(s);

describe("previousJstDayWindow", () => {
  it("reports the just-finished JST day at the production 00:15 JST tick", () => {
    // 2026-09-03T15:15Z = 2026-09-04 00:15 JST → the completed day is 09-03.
    const w = previousJstDayWindow(utc("2026-09-03T15:15:00Z"));
    expect(w.date).toBe("2026-09-03");
    expect(w.startMs).toBe(utc("2026-09-02T15:00:00Z")); // 09-03 00:00 JST
    expect(w.endMs).toBe(utc("2026-09-03T15:00:00Z")); // 09-04 00:00 JST (exclusive)
  });

  it("treats exactly midnight JST as the start of the NEW day", () => {
    const w = previousJstDayWindow(utc("2026-09-03T15:00:00Z")); // 09-04 00:00 JST
    expect(w.date).toBe("2026-09-03");
  });

  it("one ms before midnight JST still reports the day before", () => {
    const w = previousJstDayWindow(utc("2026-09-03T14:59:59Z")); // 09-03 23:59:59 JST
    expect(w.date).toBe("2026-09-02");
    expect(w.startMs).toBe(utc("2026-09-01T15:00:00Z"));
    expect(w.endMs).toBe(utc("2026-09-02T15:00:00Z"));
  });

  it("crosses month/year boundaries by the JST calendar, not UTC", () => {
    // 2026-01-01T03:00Z = 2026-01-01 12:00 JST → previous JST day is 2025-12-31.
    const w = previousJstDayWindow(utc("2026-01-01T03:00:00Z"));
    expect(w.date).toBe("2025-12-31");
  });

  it("spans exactly one JST calendar day", () => {
    const w = previousJstDayWindow(utc("2026-09-03T15:15:00Z"));
    expect(w.endMs - w.startMs).toBe(24 * 60 * 60 * 1000);
    expect(jstDay(w.startMs)).toBe(jstDay(w.endMs - 1)); // whole window = one day index
    expect(jstDay(w.endMs)).toBe(jstDay(w.startMs) + 1); // endMs already belongs to the next
  });
});
