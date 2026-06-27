// Build a neutral "study card" Markdown string for one answered question, for the
// copy-to-clipboard affordance on the Drill card. Output: 問題文 → 選択肢（正解に ✓）→ 正解 → 解説 → 設問ID
// (短答は選択肢が無いので 正解＝許容解、accept[0] を正準解・残りを別解; ADR-0012).
//
// Pure (no DOM, no clipboard) so it is unit-testable; the boundary (the button onClick)
// supplies navigator.clipboard.writeText. This is CLIENT-ONLY and copies the RAW Markdown
// SOURCE (the same text the server stored), not rendered HTML — so the ADR-0004 sanitize
// step (which is a RENDER-time concern: react-markdown + rehype-sanitize) does not apply
// to a copy into the user's own clipboard. Text is emitted as-authored (not escaped); a
// prompt/choice that itself contains Markdown may nest oddly but that is cosmetic, not a
// security issue.
//
// Choices are listed in canonical `position` order, NOT the per-mount display shuffle (#61):
// the shuffle is display-only and never persisted, so a reusable card uses the authored order.

export type MarkdownCardItem = {
  questionId: string;
  type: "mcq_single" | "mcq_multi" | "short";
  prompt: string;
  choices: { id: string; text: string; position: number }[];
};

// The post-grade reveal, discriminated by type (structurally matches the card's Feedback).
export type MarkdownCardReveal =
  | { type: "mcq_single" | "mcq_multi"; explanation: string | null; correctChoiceIds: string[] }
  | { type: "short"; explanation: string | null; acceptedAnswers: string[] };

export function buildQuestionMarkdown(item: MarkdownCardItem, reveal: MarkdownCardReveal): string {
  const lines: string[] = ["## 問題", "", item.prompt.trim()];

  if (reveal.type === "short") {
    const [canonical, ...alternates] = reveal.acceptedAnswers;
    lines.push("", `**正解:** ${canonical ?? ""}`);
    if (alternates.length > 0) lines.push(`**別解:** ${alternates.join(" / ")}`);
  } else {
    const correct = new Set(reveal.correctChoiceIds);
    const ordered = [...item.choices].sort((a, b) => a.position - b.position);
    lines.push("");
    for (const ch of ordered) {
      lines.push(`- ${ch.text}${correct.has(ch.id) ? " ✓" : ""}`);
    }
    const answers = ordered.filter((ch) => correct.has(ch.id)).map((ch) => ch.text);
    lines.push("", `**正解:** ${answers.join(" / ")}`);
  }

  const explanation = reveal.explanation?.trim();
  if (explanation) lines.push("", "**解説:**", explanation);

  // Trailing reference so a pasted card can be traced back to the source question.
  lines.push("", `**設問ID:** \`${item.questionId}\``);

  return lines.join("\n") + "\n";
}
