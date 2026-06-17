import { describe, expect, it } from "vitest";
import { MAX_TAGS_PER_QUIZ, normalizeTag, parseTags } from "./tag";

describe("normalizeTag", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeTag("  ネット　ワーク  ")).toEqual({ name: "ネット ワーク", key: "ネット ワーク" });
  });

  it("keeps display casing but lowercases the identity key", () => {
    expect(normalizeTag("Docker")).toEqual({ name: "Docker", key: "docker" });
    expect(normalizeTag("HTTP")).toEqual({ name: "HTTP", key: "http" });
  });

  it("applies NFKC so full-width folds to half-width", () => {
    // "Ｄｏｃｋｅｒ" (full-width) → "Docker"; "ＡＩ" → "AI"
    expect(normalizeTag("Ｄｏｃｋｅｒ")).toEqual({ name: "Docker", key: "docker" });
    expect(normalizeTag("ＡＩ")).toEqual({ name: "AI", key: "ai" });
  });

  it("rejects empty / whitespace-only", () => {
    expect(normalizeTag("")).toBeNull();
    expect(normalizeTag("   ")).toBeNull();
  });

  it("rejects over-length tags", () => {
    expect(normalizeTag("a".repeat(31))).toBeNull();
    expect(normalizeTag("a".repeat(30))).not.toBeNull();
  });
});

describe("parseTags", () => {
  it("dedupes by key, keeping the first display form", () => {
    expect(parseTags(["Docker", "docker", "DOCKER"])).toEqual([{ name: "Docker", key: "docker" }]);
  });

  it("drops invalid entries", () => {
    expect(parseTags(["", "  ", "valid"])).toEqual([{ name: "valid", key: "valid" }]);
  });

  it("caps at MAX_TAGS_PER_QUIZ", () => {
    const many = Array.from({ length: MAX_TAGS_PER_QUIZ + 3 }, (_, i) => `tag${i}`);
    expect(parseTags(many)).toHaveLength(MAX_TAGS_PER_QUIZ);
  });

  it("returns [] for an empty list", () => {
    expect(parseTags([])).toEqual([]);
  });
});
