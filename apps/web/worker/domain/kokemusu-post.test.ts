import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildDailyKokemusuPost,
  type DailyResults,
  digestTags,
  PROVENANCE_TAG,
} from "./kokemusu-post";
import schema from "./kokemusu-posts.schema.json";

const ORIGIN = "https://example.test";

const digest = (over: Partial<DailyResults> = {}): DailyResults => ({
  date: "2026-09-03",
  answers: { total: 0, correct: 0, answerers: 0 },
  publishedQuizzes: [],
  answeredTags: [],
  publishedTags: [],
  ...over,
});

describe("buildDailyKokemusuPost", () => {
  it("builds body / tags / kind / firstDay from a full day", () => {
    const post = buildDailyKokemusuPost(
      digest({
        answers: { total: 12, correct: 9, answerers: 1 },
        publishedQuizzes: [{ id: "q1", title: "Docker 基礎" }],
        answeredTags: [
          { name: "linux", answers: 4 },
          { name: "Docker", answers: 8 },
        ],
        publishedTags: ["Docker", "コンテナ"],
      }),
      ORIGIN,
    );
    expect(post).toEqual({
      body: [
        "- 回答: 12問（正答 9・75%・回答者 1人）",
        "- 公開: 1件",
        "  - [Docker 基礎](https://example.test/#/quiz/q1)",
      ].join("\n"),
      // Provenance first, then the day's tags by answers; published-only ones last.
      tags: ["まず覚える", "Docker", "linux", "コンテナ"],
      kind: "both",
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
    expect(post?.tags).toEqual(["まず覚える"]);
  });

  it("omits the answers line when only a publish happened, and still tags the publish", () => {
    const post = buildDailyKokemusuPost(
      digest({
        publishedQuizzes: [{ id: "q9", title: "HTTP メソッド" }],
        publishedTags: ["HTTP", "web基礎"],
      }),
      ORIGIN,
    );
    expect(post?.body).toBe(
      ["- 公開: 1件", "  - [HTTP メソッド](https://example.test/#/quiz/q9)"].join("\n"),
    );
    expect(post?.tags).toEqual(["まず覚える", "HTTP", "web基礎"]);
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
    const post = buildDailyKokemusuPost(
      digest({
        publishedQuizzes: huge,
        publishedTags: Array.from({ length: 60 }, (_, i) => `tag${i}`),
      }),
      ORIGIN,
    );
    expect(post?.body.length).toBeLessThanOrEqual(schema.properties.body.maxLength);
    expect(post?.body.endsWith("…")).toBe(true);
    expect(post?.tags.length).toBeLessThanOrEqual(schema.properties.tags.maxItems);
  });
});

// The tag set (CONTEXT.md Daily Digest; ADR-0017 補記 2026-09-11): provenance + the
// day's quiz tags, in an order that makes the receiver's cap explainable.
describe("digestTags", () => {
  const tags = (over: Partial<Pick<DailyResults, "answeredTags" | "publishedTags">>) =>
    digestTags({ answeredTags: [], publishedTags: [], ...over });

  it("is just the provenance tag when the day touched no tagged quiz", () => {
    expect(tags({})).toEqual([PROVENANCE_TAG]);
    expect(PROVENANCE_TAG).toBe("まず覚える");
  });

  it("ranks answered tags by answers, ties by name", () => {
    expect(
      tags({
        answeredTags: [
          { name: "typescript", answers: 2 },
          { name: "Docker", answers: 5 },
          { name: "linux", answers: 2 },
        ],
      }),
    ).toEqual(["まず覚える", "Docker", "linux", "typescript"]);
  });

  it("puts published-only tags after answered ones, and does not double a tag in both", () => {
    expect(
      tags({
        answeredTags: [{ name: "Docker", answers: 1 }],
        publishedTags: ["kernel", "Docker", "api"],
      }),
    ).toEqual(["まず覚える", "Docker", "api", "kernel"]);
  });

  it("dedupes by the tag's normalized key and never repeats the provenance tag", () => {
    expect(
      tags({
        answeredTags: [
          { name: "docker", answers: 1 },
          { name: "Docker", answers: 3 },
          { name: "まず覚える", answers: 9 },
        ],
        publishedTags: ["ＤＯＣＫＥＲ", " まず覚える "],
      }),
    ).toEqual(["まず覚える", "docker"]);
  });

  it("clamps to the receiver's cap keeping the provenance tag and the most-answered", () => {
    const cap = schema.properties.tags.maxItems;
    const answered = Array.from({ length: cap + 10 }, (_, i) => ({
      name: `t${String(i).padStart(2, "0")}`,
      answers: i, // the last one is the most answered
    }));
    const out = tags({ answeredTags: answered, publishedTags: ["published-only"] });
    expect(out).toHaveLength(cap);
    expect(out[0]).toBe("まず覚える");
    expect(out[1]).toBe(`t${cap + 9}`);
    expect(out).not.toContain("t00");
    expect(out).not.toContain("published-only");
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
      answeredTags: [{ name: "Docker", answers: 12 }],
      publishedTags: ["Docker", "コンテナ"],
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
    // A heavy study day: more distinct tags than the receiver takes (the cap is read
    // from this very schema, so this stays true after a re-vendor raises it).
    digest({
      answers: { total: 80, correct: 60, answerers: 3 },
      answeredTags: Array.from({ length: schema.properties.tags.maxItems + 30 }, (_, i) => ({
        name: `tag${i}`,
        answers: i + 1,
      })),
      publishedTags: ["extra"],
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

  it("refuses one tag over the receiver's cap — so the clamp is load-bearing", () => {
    const post = buildDailyKokemusuPost(shapes[0] as DailyResults, ORIGIN);
    const over = Array.from({ length: schema.properties.tags.maxItems + 1 }, (_, i) => `t${i}`);
    expect(accepts({ ...post, tags: over })).toBe(false);
  });

  it("is the published file, not a hand-written one", () => {
    expect(schema.$id).toBe(
      "https://raw.githubusercontent.com/okayus/kokemusu/main/docs/senders/posts.schema.json",
    );
  });
});
