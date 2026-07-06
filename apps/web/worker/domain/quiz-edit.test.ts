import { describe, expect, it } from "vitest";
import { type EditQuestionInput, type ExistingQuestion, planPublishedEdit } from "./quiz-edit";

const mcq = (over: Partial<ExistingQuestion> & { id: string }): ExistingQuestion => ({
  type: "mcq_single",
  prompt: "p",
  explanation: null,
  answer: [],
  choices: [
    { text: "a", isCorrect: true },
    { text: "b", isCorrect: false },
  ],
  position: 0,
  ...over,
});

const payloadOf = (ex: ExistingQuestion): EditQuestionInput => ({
  id: ex.id,
  type: ex.type,
  prompt: ex.prompt,
  explanation: ex.explanation,
  answer: ex.answer,
  choices: ex.choices,
});

describe("planPublishedEdit", () => {
  it("identical payload => everything unchanged, nothing written", () => {
    const q1 = mcq({ id: "q1", position: 0 });
    const q2 = mcq({ id: "q2", position: 1, prompt: "p2" });
    const res = planPublishedEdit([q1, q2], [payloadOf(q1), payloadOf(q2)]);
    if (!res.ok) throw new Error("expected ok");
    expect(res.plan.updates).toEqual([]);
    expect(res.plan.inserts).toEqual([]);
    expect(res.plan.retireIds).toEqual([]);
    expect(res.plan.unchangedIds).toEqual(["q1", "q2"]);
  });

  it("content change on one question => a single id-preserving update", () => {
    const q1 = mcq({ id: "q1", position: 0 });
    const q2 = mcq({ id: "q2", position: 1 });
    const edited = { ...payloadOf(q2), prompt: "fixed" };
    const res = planPublishedEdit([q1, q2], [payloadOf(q1), edited]);
    if (!res.ok) throw new Error("expected ok");
    expect(res.plan.updates).toHaveLength(1);
    expect(res.plan.updates[0]).toMatchObject({ id: "q2", prompt: "fixed", position: 1 });
    expect(res.plan.unchangedIds).toEqual(["q1"]);
  });

  it("choice edits (text / correctness / count) mark the question updated", () => {
    const q1 = mcq({ id: "q1" });
    const flipped = {
      ...payloadOf(q1),
      choices: [
        { text: "a", isCorrect: false },
        { text: "b", isCorrect: true },
      ],
    };
    const res = planPublishedEdit([q1], [flipped]);
    if (!res.ok) throw new Error("expected ok");
    expect(res.plan.updates.map((u) => u.id)).toEqual(["q1"]);

    const added = {
      ...payloadOf(q1),
      choices: [...q1.choices, { text: "c", isCorrect: false }],
    };
    const res2 = planPublishedEdit([q1], [added]);
    if (!res2.ok) throw new Error("expected ok");
    expect(res2.plan.updates.map((u) => u.id)).toEqual(["q1"]);
  });

  it("omitted existing id => retire; id-less question => insert; order => position", () => {
    const q1 = mcq({ id: "q1", position: 0 });
    const q2 = mcq({ id: "q2", position: 1 });
    const fresh: EditQuestionInput = {
      type: "short",
      prompt: "new one",
      explanation: null,
      answer: ["nsproxy"],
      choices: [],
    };
    // new question first, then q2 — q1 is omitted => retired; q2 moves 1 -> 1? no: to index 1
    const res = planPublishedEdit([q1, q2], [fresh, payloadOf(q2)]);
    if (!res.ok) throw new Error("expected ok");
    expect(res.plan.retireIds).toEqual(["q1"]);
    expect(res.plan.inserts).toHaveLength(1);
    expect(res.plan.inserts[0]).toMatchObject({ position: 0, type: "short" });
    // q2 content is identical but its position is still 1 => unchanged (no write)
    expect(res.plan.unchangedIds).toEqual(["q2"]);
  });

  it("a pure reorder emits position-only updates", () => {
    const q1 = mcq({ id: "q1", position: 0 });
    const q2 = mcq({ id: "q2", position: 1 });
    const res = planPublishedEdit([q1, q2], [payloadOf(q2), payloadOf(q1)]);
    if (!res.ok) throw new Error("expected ok");
    expect(res.plan.updates.map((u) => ({ id: u.id, position: u.position }))).toEqual([
      { id: "q2", position: 0 },
      { id: "q1", position: 1 },
    ]);
    expect(res.plan.retireIds).toEqual([]);
  });

  it("unknown id is rejected — a typo must not silently retire + re-insert", () => {
    const q1 = mcq({ id: "q1" });
    const typo = { ...payloadOf(q1), id: "q1-TYPO" };
    const res = planPublishedEdit([q1], [typo]);
    if (res.ok) throw new Error("expected problems");
    expect(res.problems).toEqual([{ kind: "unknown_question_id", id: "q1-TYPO" }]);
  });

  it("duplicate ids in the payload are rejected", () => {
    const q1 = mcq({ id: "q1" });
    const res = planPublishedEdit([q1], [payloadOf(q1), payloadOf(q1)]);
    if (res.ok) throw new Error("expected problems");
    expect(res.problems).toEqual([{ kind: "duplicate_question_id", id: "q1" }]);
  });

  it("type change is rejected (retire + add a new question instead)", () => {
    const q1 = mcq({ id: "q1" });
    const res = planPublishedEdit([q1], [{ ...payloadOf(q1), type: "short", choices: [] }]);
    if (res.ok) throw new Error("expected problems");
    expect(res.problems).toEqual([
      { kind: "type_change", id: "q1", from: "mcq_single", to: "short" },
    ]);
  });

  it("retiring everything is a valid plan (the route's edit gate rejects it, not the planner)", () => {
    const q1 = mcq({ id: "q1" });
    const res = planPublishedEdit([q1], []);
    if (!res.ok) throw new Error("expected ok");
    expect(res.plan.retireIds).toEqual(["q1"]);
    expect(res.plan.updates).toEqual([]);
    expect(res.plan.inserts).toEqual([]);
  });
});
