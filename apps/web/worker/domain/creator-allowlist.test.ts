import { describe, expect, it } from "vitest";
import { isCreatorAllowed, parseCreatorAllowlist } from "./creator-allowlist";

describe("parseCreatorAllowlist", () => {
  it("returns an empty set for absent / blank input (gate off)", () => {
    expect(parseCreatorAllowlist(undefined).size).toBe(0);
    expect(parseCreatorAllowlist(null).size).toBe(0);
    expect(parseCreatorAllowlist("").size).toBe(0);
    expect(parseCreatorAllowlist("   ").size).toBe(0);
  });

  it("splits on commas and whitespace, trims, and lowercases", () => {
    const set = parseCreatorAllowlist("  Alice@Example.com, bob@x.io\n carol@y.org ");
    expect(set).toEqual(new Set(["alice@example.com", "bob@x.io", "carol@y.org"]));
  });

  it("dedupes case-insensitively", () => {
    expect(parseCreatorAllowlist("a@b.com, A@B.COM").size).toBe(1);
  });
});

describe("isCreatorAllowed", () => {
  const allow = parseCreatorAllowlist("owner@example.com, second@example.com");

  it("allows anyone when the allowlist is empty (gate off)", () => {
    const off = parseCreatorAllowlist(undefined);
    expect(isCreatorAllowed(off, "stranger@example.com")).toBe(true);
    expect(isCreatorAllowed(off, null)).toBe(true);
  });

  it("allows a listed email, case-insensitively and trimmed", () => {
    expect(isCreatorAllowed(allow, "owner@example.com")).toBe(true);
    expect(isCreatorAllowed(allow, "  Owner@Example.com ")).toBe(true);
    expect(isCreatorAllowed(allow, "second@example.com")).toBe(true);
  });

  it("denies an unlisted email when the gate is on", () => {
    expect(isCreatorAllowed(allow, "stranger@example.com")).toBe(false);
  });

  it("denies a caller with no email when the gate is on (fail closed)", () => {
    expect(isCreatorAllowed(allow, null)).toBe(false);
    expect(isCreatorAllowed(allow, undefined)).toBe(false);
    expect(isCreatorAllowed(allow, "")).toBe(false);
  });
});
