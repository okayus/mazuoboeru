import { describe, expect, it } from "vitest";
import type { Bindings } from "../types";
import { db } from "./client";
import { chunk, contentStatements, type QuizContentInput } from "./quiz-queries";

// contentStatements only *builds* statements (drizzle .toSQL()) — it never executes —
// so a fake D1 binding is enough; no Cloudflare runtime needed (vitest node env).
const d = db({ DB: {} } as unknown as Bindings);

function paramsOf(stmt: unknown): number {
  return (stmt as { toSQL(): { params: unknown[] } }).toSQL().params.length;
}
const totalParams = (stmts: unknown[]): number =>
  stmts.reduce<number>((n, s) => n + paramsOf(s), 0);

function makeInput(nQuestions: number, choicesPer: number): QuizContentInput {
  return {
    title: "t",
    description: null,
    questions: Array.from({ length: nQuestions }, (_, i) => ({
      type: "mcq_single" as const,
      prompt: `q${i}`,
      explanation: null,
      choices: Array.from({ length: choicesPer }, (_, j) => ({
        text: `c${j}`,
        isCorrect: j === 0,
      })),
      answer: [],
    })),
  };
}

describe("chunk", () => {
  it("splits into fixed-size groups, preserving order and elements", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("returns [] for an empty array", () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

// Regression for the create/PATCH 500: contentStatements used to emit one INSERT for
// ALL choices, which D1 rejects past 100 bound params (5/row => >20 choices). Each
// generated statement must now stay within D1's per-statement cap of 100.
describe("contentStatements — D1 100-bound-param chunking", () => {
  it("keeps every statement <= 100 params at the zod maximum (100 questions x 20 choices)", () => {
    // Pre-fix this was a single 10000-param choice INSERT -> D1 rejects -> route 500.
    const stmts = contentStatements(d, "quiz-1", makeInput(100, 20));
    for (const s of stmts) expect(paramsOf(s)).toBeLessThanOrEqual(100);
    expect(stmts.length).toBeGreaterThan(2); // proves it actually chunked
    // No rows dropped or duplicated across chunks: questions*7 (incl. answer) + choices*5.
    expect(totalParams(stmts)).toBe(100 * 7 + 2000 * 5);
  });

  it("fixes the exact prod repro: 6 questions x 5 choices (30 > 20) no longer overflows", () => {
    // Measured in prod 2026-06-20: 25 choices = 125 params -> 500. 30 choices here.
    const stmts = contentStatements(d, "quiz-1", makeInput(6, 5));
    for (const s of stmts) expect(paramsOf(s)).toBeLessThanOrEqual(100);
    expect(totalParams(stmts)).toBe(6 * 7 + 30 * 5);
  });

  it("boundary: 20 choices = exactly 100 params (one statement); 21 splits the choice INSERT", () => {
    // makeInput(1, n): one question statement (7 params: + answer) + the choice statement(s).
    expect(
      contentStatements(d, "q", makeInput(1, 20))
        .map(paramsOf)
        .sort((a, b) => a - b),
    ).toEqual([7, 100]);
    expect(
      contentStatements(d, "q", makeInput(1, 21))
        .map(paramsOf)
        .sort((a, b) => a - b),
    ).toEqual([5, 7, 100]);
  });

  it("a short question: one question INSERT carries the answer JSON, no choice INSERT", () => {
    const stmts = contentStatements(d, "q", {
      title: "t",
      description: null,
      questions: [
        {
          type: "short",
          prompt: "p",
          explanation: null,
          choices: [],
          answer: ["nsproxy", "struct nsproxy"],
        },
      ],
    });
    expect(stmts.length).toBe(1); // question only — no choices
    expect(paramsOf(stmts[0])).toBe(7);
  });

  it("emits no statements for an empty draft (0 questions)", () => {
    expect(contentStatements(d, "quiz-1", makeInput(0, 0))).toEqual([]);
  });
});
