import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildDailyKokemusuPost, type DailyResults } from "./kokemusu-post";
import schema from "./kokemusu-posts.schema.json";

const ORIGIN = "https://example.test";

const digest = (over: Partial<DailyResults> = {}): DailyResults => ({
  date: "2026-09-03",
  answers: { total: 0, correct: 0, answerers: 0 },
  publishedQuizzes: [],
  ...over,
});

describe("buildDailyKokemusuPost", () => {
  it("builds body / tags / firstDay from a full day", () => {
    const post = buildDailyKokemusuPost(
      digest({
        answers: { total: 12, correct: 9, answerers: 1 },
        publishedQuizzes: [{ id: "q1", title: "Docker 基礎" }],
      }),
      ORIGIN,
    );
    expect(post).toEqual({
      body: [
        "- 回答: 12問（正答 9・75%・回答者 1人）",
        "- 公開: 1件",
        "  - [Docker 基礎](https://example.test/#/quiz/q1)",
      ].join("\n"),
      tags: ["mazuoboeru"],
      // The day the digest is about, so the 苔片 stacks there — not on the send day.
      firstDay: "2026-09-03",
    });
  });

  it("returns null on a day with no activity (nothing is posted)", () => {
    expect(buildDailyKokemusuPost(digest(), ORIGIN)).toBeNull();
  });

  it("omits the publish section when only answers happened", () => {
    const post = buildDailyKokemusuPost(
      digest({ answers: { total: 3, correct: 2, answerers: 2 } }),
      ORIGIN,
    );
    expect(post?.body).toBe("- 回答: 3問（正答 2・67%・回答者 2人）"); // 2/3 rounds to 67
  });

  it("omits the answers line when only a publish happened", () => {
    const post = buildDailyKokemusuPost(
      digest({ publishedQuizzes: [{ id: "q9", title: "HTTP メソッド" }] }),
      ORIGIN,
    );
    expect(post?.body).toBe(
      ["- 公開: 1件", "  - [HTTP メソッド](https://example.test/#/quiz/q9)"].join("\n"),
    );
  });

  it("caps the published list and counts the rest", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `q${i}`, title: `Quiz ${i}` }));
    const post = buildDailyKokemusuPost(digest({ publishedQuizzes: many }), ORIGIN);
    const lines = post?.body.split("\n") ?? [];
    expect(lines[0]).toBe("- 公開: 25件");
    expect(lines).toHaveLength(1 + 20 + 1);
    expect(lines.at(-1)).toBe("  - …他 5 件");
  });

  it("neutralizes UGC titles that would break the Markdown list/link", () => {
    const post = buildDailyKokemusuPost(
      digest({ publishedQuizzes: [{ id: "q1", title: "改行\nと [括弧] 入り" }] }),
      ORIGIN,
    );
    expect(post?.body).toContain("  - [改行 と \\[括弧\\] 入り](https://example.test/#/quiz/q1)");
  });

  it("stays inside the receiver's limits even for absurd input", () => {
    const huge = Array.from({ length: 30 }, (_, i) => ({
      id: `q${i}`,
      title: "あ".repeat(30_000),
    }));
    const post = buildDailyKokemusuPost(digest({ publishedQuizzes: huge }), ORIGIN);
    expect(post?.body.length).toBeLessThanOrEqual(20_000);
    expect(post?.body.endsWith("…")).toBe(true);
    expect(post?.tags.length).toBeLessThanOrEqual(20);
  });
});

// The receiver's contract, as the receiver publishes it (kokemusu docs/senders.md →
// docs/senders/posts.schema.json, generated from its zod schema and vendored here by
// `pnpm kokemusu:schema`). Reading it back with z.fromJSONSchema turns "what kokemusu
// accepts" into a test the builder must pass — the check that was missing when the
// receiver retired `title` (kokemusu ADR-0006) and every 00:15 push turned into a 400
// while both projects' suites stayed green (ADR-0017 補記).
describe("the receiver's contract (vendored kokemusu-posts.schema.json)", () => {
  const contract = z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]);
  const accepts = (payload: unknown) => contract.safeParse(payload).success;

  const shapes = [
    digest({
      answers: { total: 12, correct: 9, answerers: 1 },
      publishedQuizzes: [{ id: "q1", title: "Docker 基礎" }],
    }),
    digest({ answers: { total: 3, correct: 2, answerers: 2 } }),
    digest({
      publishedQuizzes: Array.from({ length: 25 }, (_, i) => ({ id: `q${i}`, title: `Quiz ${i}` })),
    }),
    digest({
      publishedQuizzes: Array.from({ length: 30 }, (_, i) => ({
        id: `q${i}`,
        title: "あ".repeat(30_000),
      })),
    }),
  ];

  it("accepts every shape the builder produces", () => {
    for (const results of shapes) {
      const post = buildDailyKokemusuPost(results, ORIGIN);
      expect(post).not.toBeNull();
      expect(contract.safeParse(post).error?.issues ?? []).toEqual([]);
    }
  });

  it("refuses the 見出し the receiver retired — the drift this suite exists to catch", () => {
    const post = buildDailyKokemusuPost(shapes[0] as DailyResults, ORIGIN);
    expect(accepts({ ...post, title: "まず覚える 2026-09-03" })).toBe(false);
  });

  it("is the published file, not a hand-written one", () => {
    expect(schema.$id).toBe(
      "https://raw.githubusercontent.com/okayus/kokemusu/main/docs/senders/posts.schema.json",
    );
  });
});
