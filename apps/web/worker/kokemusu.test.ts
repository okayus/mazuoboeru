import { afterEach, describe, expect, it, vi } from "vitest";
import { postWithBearer } from "./kokemusu";

const PAYLOAD = { title: "まず覚える 2026-09-03", body: "- 回答: 1問", tags: ["mazuoboeru"] };
const TOKEN = "kokemusu_pat_secret-token";

type FetchCall = { input: string; init: RequestInit };

// Capture-and-respond fetch double (the boundary takes fetchImpl for exactly this).
function fetchDouble(respond: () => Promise<Response>): { impl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const impl = (async (input: unknown, init?: unknown) => {
    calls.push({ input: String(input), init: (init ?? {}) as RequestInit });
    return respond();
  }) as typeof fetch;
  return { impl, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("postWithBearer", () => {
  it("POSTs the JSON payload with exactly Bearer + content-type", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { impl, calls } = fetchDouble(async () => new Response(null, { status: 201 }));

    const status = await postWithBearer("https://diary.example", TOKEN, PAYLOAD, impl);

    expect(status).toBe(201);
    expect(calls).toHaveLength(1);
    const call = calls[0] as FetchCall;
    expect(call.input).toBe("https://diary.example/api/posts");
    expect(call.init.method).toBe("POST");
    expect(call.init.headers).toEqual({
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    });
    expect(JSON.parse(String(call.init.body))).toEqual(PAYLOAD);
    // Logs the status — and never the token or the body.
    const logged = log.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("201");
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(PAYLOAD.body);
  });

  it("normalizes a trailing slash in the base URL", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { impl, calls } = fetchDouble(async () => new Response(null, { status: 201 }));
    await postWithBearer("https://diary.example/", TOKEN, PAYLOAD, impl);
    expect((calls[0] as FetchCall).input).toBe("https://diary.example/api/posts");
  });

  it("resolves (never throws) on a non-2xx response and reports the status", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { impl } = fetchDouble(async () => new Response(null, { status: 500 }));
    await expect(postWithBearer("https://diary.example", TOKEN, PAYLOAD, impl)).resolves.toBe(500);
  });

  it("resolves null (never throws) when the network itself fails", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const impl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(postWithBearer("https://diary.example", TOKEN, PAYLOAD, impl)).resolves.toBeNull();
    expect(log.mock.calls.flat().map(String).join(" ")).not.toContain(TOKEN);
  });
});
