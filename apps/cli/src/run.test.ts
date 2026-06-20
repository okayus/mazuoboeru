import { describe, expect, it, vi } from "vitest";
import { type Io, run } from "./run.ts";

type Captured = { out: string[]; err: string[] };

type Overrides = {
  env?: Record<string, string | undefined>;
  readFile?: Io["readFile"];
  readStdin?: Io["readStdin"];
  fetch?: Io["fetch"];
};

function makeIo(overrides: Overrides = {}): { io: Io; cap: Captured } {
  const cap: Captured = { out: [], err: [] };
  const env = overrides.env ?? { MAZUOBOERU_PAT: "mzo_pat_test" };
  const io: Io = {
    env: (k) => env[k],
    readFile: overrides.readFile ?? (async () => "{}"),
    readStdin: overrides.readStdin ?? (async () => "{}"),
    fetch: overrides.fetch ?? (async () => new Response("{}", { status: 200 })),
    stdout: (l) => cap.out.push(l),
    stderr: (l) => cap.err.push(l),
  };
  return { io, cap };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("run", () => {
  it("prints usage and exits 0 on help", async () => {
    const { io, cap } = makeIo();
    expect(await run(["help"], io)).toBe(0);
    expect(cap.out.join("\n")).toContain("Usage");
  });

  it("exits 2 when MAZUOBOERU_PAT is missing", async () => {
    const { io, cap } = makeIo({ env: {} });
    expect(await run(["create"], io)).toBe(2);
    expect(cap.err.join("\n")).toContain("MAZUOBOERU_PAT");
  });

  it("creates a quiz: prints the id, exits 0, sends Bearer to the default prod base", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(201, { id: "q-99" }),
    ) as unknown as typeof globalThis.fetch;
    const { io, cap } = makeIo({ fetch, readStdin: async () => '{"title":"t","questions":[]}' });
    expect(await run(["create"], io)).toBe(0);
    expect(cap.out).toEqual(["q-99"]);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://mazuoboeru.shiraoka.workers.dev/api/quizzes");
    expect((init as RequestInit).body).toBe('{"title":"t","questions":[]}');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer mzo_pat_test" });
  });

  it("honors MAZUOBOERU_BASE_URL override", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(201, { id: "x" }),
    ) as unknown as typeof globalThis.fetch;
    const { io } = makeIo({
      env: { MAZUOBOERU_PAT: "t", MAZUOBOERU_BASE_URL: "http://localhost:5373" },
      fetch,
      readStdin: async () => "{}",
    });
    await run(["create"], io);
    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://localhost:5373/api/quizzes");
  });

  it("exits 2 on malformed JSON input without calling fetch", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(201, { id: "x" }),
    ) as unknown as typeof globalThis.fetch;
    const { io, cap } = makeIo({ fetch, readStdin: async () => "not json" });
    expect(await run(["create"], io)).toBe(2);
    expect(cap.err.join("\n")).toContain("not valid JSON");
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("publishes: prints confirmation and exits 0", async () => {
    const { io, cap } = makeIo({ fetch: async () => jsonResponse(200, { ok: true }) });
    expect(await run(["publish", "q-7"], io)).toBe(0);
    expect(cap.out).toEqual(["published q-7"]);
  });

  it("maps a 422 publish to exit 1 with the gradeability errors", async () => {
    const { io, cap } = makeIo({
      fetch: async () => jsonResponse(422, { error: "not_publishable", errors: ["no_questions"] }),
    });
    expect(await run(["publish", "q-7"], io)).toBe(1);
    expect(cap.err.join("\n")).toContain("no_questions");
  });

  it("maps a network failure to exit 1 (throw-less)", async () => {
    const { io, cap } = makeIo({
      fetch: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(await run(["create"], io)).toBe(1);
    expect(cap.err.join("\n")).toContain("network error");
  });
});
