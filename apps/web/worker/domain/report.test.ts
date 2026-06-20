import { describe, expect, it } from "vitest";
import {
  isReportRateLimited,
  REPORT_RATE_LIMIT,
  REPORT_REASON_CATEGORIES,
  REPORT_TARGET_TYPES,
} from "./report";

describe("isReportRateLimited", () => {
  it("allows counts below the limit", () => {
    expect(isReportRateLimited(0)).toBe(false);
    expect(isReportRateLimited(REPORT_RATE_LIMIT - 1)).toBe(false);
  });

  it("blocks at and beyond the limit", () => {
    expect(isReportRateLimited(REPORT_RATE_LIMIT)).toBe(true);
    expect(isReportRateLimited(REPORT_RATE_LIMIT + 5)).toBe(true);
  });
});

describe("report enums", () => {
  it("match the data-model categories and target types", () => {
    expect(REPORT_TARGET_TYPES).toEqual(["quiz", "question", "user"]);
    expect(REPORT_REASON_CATEGORIES).toEqual(["spam", "sexual", "violence", "copyright", "other"]);
  });
});
