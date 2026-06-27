import { describe, expect, it } from "vitest";
import { buildQuestionMarkdown, type MarkdownCardReveal } from "./question-markdown";

describe("buildQuestionMarkdown", () => {
  it("renders an mcq_single study card: prompt, choices with ✓ on the correct one, 正解, 解説", () => {
    const md = buildQuestionMarkdown(
      {
        questionId: "q-404",
        type: "mcq_single",
        prompt: "HTTP ステータス 404 の意味は？",
        choices: [
          { id: "a", text: "Not Found", position: 0 },
          { id: "b", text: "Forbidden", position: 1 },
          { id: "c", text: "Bad Request", position: 2 },
          { id: "d", text: "500 Internal Server Error", position: 3 },
        ],
      },
      {
        type: "mcq_single",
        explanation: "404 はリソースが見つからないことを示す。",
        correctChoiceIds: ["a"],
      },
    );
    expect(md).toBe(
      [
        "## 問題",
        "",
        "HTTP ステータス 404 の意味は？",
        "",
        "- Not Found ✓",
        "- Forbidden",
        "- Bad Request",
        "- 500 Internal Server Error",
        "",
        "**正解:** Not Found",
        "",
        "**解説:**",
        "404 はリソースが見つからないことを示す。",
        "",
        "**設問ID:** `q-404`",
        "",
      ].join("\n"),
    );
  });

  it("lists choices in canonical position order, not the given array order (display shuffle is ignored)", () => {
    const md = buildQuestionMarkdown(
      {
        questionId: "q-order",
        type: "mcq_single",
        prompt: "Q",
        // intentionally out of position order, as a per-mount shuffle would hand it in
        choices: [
          { id: "b", text: "second", position: 1 },
          { id: "a", text: "first", position: 0 },
        ],
      },
      { type: "mcq_single", explanation: null, correctChoiceIds: ["a"] },
    );
    expect(md).toContain("- first ✓\n- second\n");
  });

  it("marks every correct choice for mcq_multi and joins them in 正解", () => {
    const md = buildQuestionMarkdown(
      {
        questionId: "q-multi",
        type: "mcq_multi",
        prompt: "正しいものをすべて選べ",
        choices: [
          { id: "a", text: "A", position: 0 },
          { id: "b", text: "B", position: 1 },
          { id: "c", text: "C", position: 2 },
        ],
      },
      { type: "mcq_multi", explanation: null, correctChoiceIds: ["a", "c"] },
    );
    expect(md).toContain("- A ✓\n- B\n- C ✓\n");
    expect(md).toContain("**正解:** A / C");
  });

  it("renders a short-answer card: 正解 = accept[0], remaining accepted answers as 別解, no choice list", () => {
    const md = buildQuestionMarkdown(
      {
        questionId: "q-ns",
        type: "short",
        prompt: "各 namespace へのポインタをまとめた構造体は？",
        choices: [],
      },
      {
        type: "short",
        explanation: "task_struct から参照される。",
        acceptedAnswers: ["nsproxy", "struct nsproxy"],
      },
    );
    expect(md).toBe(
      [
        "## 問題",
        "",
        "各 namespace へのポインタをまとめた構造体は？",
        "",
        "**正解:** nsproxy",
        "**別解:** struct nsproxy",
        "",
        "**解説:**",
        "task_struct から参照される。",
        "",
        "**設問ID:** `q-ns`",
        "",
      ].join("\n"),
    );
    expect(md).not.toContain("- ");
  });

  it("omits the 解説 section when the explanation is null or blank", () => {
    const base = {
      questionId: "q-omit",
      type: "mcq_single" as const,
      prompt: "Q",
      choices: [{ id: "a", text: "A", position: 0 }],
    };
    const reveal = (explanation: string | null): MarkdownCardReveal => ({
      type: "mcq_single",
      explanation,
      correctChoiceIds: ["a"],
    });
    expect(buildQuestionMarkdown(base, reveal(null))).not.toContain("**解説:**");
    expect(buildQuestionMarkdown(base, reveal("   "))).not.toContain("**解説:**");
  });

  it("always ends with the 設問ID as a trailing reference, even with no explanation", () => {
    const md = buildQuestionMarkdown(
      { questionId: "q-123", type: "short", prompt: "Q", choices: [] },
      { type: "short", explanation: null, acceptedAnswers: ["x"] },
    );
    expect(md.trimEnd().endsWith("**設問ID:** `q-123`")).toBe(true);
  });
});
