import { describe, expect, it } from "vitest";
import {
  gradeShortAnswer,
  normalizeAnswer,
  parseAcceptedAnswers,
  serializeAcceptedAnswers,
} from "./short-answer";

describe("normalizeAnswer (mechanical noise only — ADR-0012)", () => {
  it("lowercases (case-insensitive)", () => {
    expect(normalizeAnswer("NSProxy")).toBe("nsproxy");
    expect(normalizeAnswer("TCP")).toBe("tcp");
  });

  it("folds full-width to half-width via NFKC", () => {
    expect(normalizeAnswer("ＮSProxy")).toBe("nsproxy"); // full-width N
    expect(normalizeAnswer("ＴＣＰ")).toBe("tcp"); // full-width latin
    expect(normalizeAnswer("１２３")).toBe("123"); // full-width digits
  });

  it("trims and collapses internal whitespace (incl. full-width space)", () => {
    expect(normalizeAnswer("  struct   nsproxy  ")).toBe("struct nsproxy");
    expect(normalizeAnswer("struct　nsproxy")).toBe("struct nsproxy"); // U+3000
  });

  it("does NOT fold kana (semantic — belongs in the accepted list, not the normalizer)", () => {
    expect(normalizeAnswer("セマフォ")).not.toBe(normalizeAnswer("せまふぉ"));
  });
});

describe("gradeShortAnswer (normalize both sides, exact match)", () => {
  it("accepts a case/width/whitespace variant of an accepted answer", () => {
    expect(gradeShortAnswer(["nsproxy"], " NSProxy ")).toBe(true);
    expect(gradeShortAnswer(["struct nsproxy"], "struct　NSPROXY")).toBe(true);
  });

  it("accepts any answer in the list (別解)", () => {
    const accept = ["nsproxy", "struct nsproxy"];
    expect(gradeShortAnswer(accept, "struct nsproxy")).toBe(true);
    expect(gradeShortAnswer(accept, "nsproxy")).toBe(true);
  });

  it("rejects a non-matching answer", () => {
    expect(gradeShortAnswer(["nsproxy"], "task_struct")).toBe(false);
  });

  it("empty / whitespace-only input is never correct", () => {
    expect(gradeShortAnswer(["nsproxy"], "")).toBe(false);
    expect(gradeShortAnswer(["nsproxy"], "   ")).toBe(false);
  });

  it("no accepted answers → never correct", () => {
    expect(gradeShortAnswer([], "nsproxy")).toBe(false);
  });
});

describe("accepted-answer JSON storage round-trip", () => {
  it("serialize → parse preserves the raw list", () => {
    const accept = ["nsproxy", "struct nsproxy"];
    expect(parseAcceptedAnswers(serializeAcceptedAnswers(accept))).toEqual(accept);
  });

  it("parse is defensive: NULL / malformed / wrong shape → []", () => {
    expect(parseAcceptedAnswers(null)).toEqual([]);
    expect(parseAcceptedAnswers("not json")).toEqual([]);
    expect(parseAcceptedAnswers('{"accept":"x"}')).toEqual([]); // accept not an array
    expect(parseAcceptedAnswers('["nsproxy"]')).toEqual([]); // missing accept key
    expect(parseAcceptedAnswers('{"accept":["a",1,null,"b"]}')).toEqual(["a", "b"]); // non-strings dropped
  });
});
