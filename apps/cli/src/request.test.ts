import { describe, expect, it } from "vitest";
import {
  createOutcome,
  createRequest,
  getOutcome,
  getRequest,
  listOutcome,
  meRequest,
  mineRequest,
  publishOutcome,
  publishRequest,
  whoamiOutcome,
} from "./request.ts";

describe("createRequest", () => {
  it("POSTs to /api/quizzes with Bearer auth and the raw body", () => {
    const { url, init } = createRequest("https://x.example", "mzo_pat_abc", '{"title":"t"}');
    expect(url).toBe("https://x.example/api/quizzes");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"title":"t"}');
    expect(init.headers).toMatchObject({
      Authorization: "Bearer mzo_pat_abc",
      "Content-Type": "application/json",
    });
  });

  it("strips a trailing slash from the base url", () => {
    expect(createRequest("https://x.example/", "t", "{}").url).toBe(
      "https://x.example/api/quizzes",
    );
  });
});

describe("publishRequest", () => {
  it("POSTs to the publish route with the id encoded", () => {
    const { url, init } = publishRequest("https://x.example", "t", "a b/c");
    expect(url).toBe("https://x.example/api/quizzes/a%20b%2Fc/publish");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });
});

describe("createOutcome", () => {
  it("returns the id on 201", () => {
    expect(createOutcome(201, { id: "q1" })).toEqual({ stdout: "q1", code: 0 });
  });

  it("maps 400 with issues to a non-zero exit", () => {
    const o = createOutcome(400, { error: "invalid_body", issues: [{ path: ["title"] }] });
    expect(o.code).toBe(1);
    expect(o.stdout).toBeUndefined();
    expect(o.stderr).toContain("invalid_body");
    expect(o.stderr).toContain("title");
  });

  it("hints at the PAT on 401", () => {
    expect(createOutcome(401, { error: "unauthorized" }).stderr).toContain("MAZUOBOERU_PAT");
  });

  it("falls back to http_<status> when there is no error field", () => {
    expect(createOutcome(500, null).stderr).toContain("http_500");
  });
});

describe("read requests (list / get / whoami)", () => {
  it("mineRequest GETs /api/quizzes/mine with a bearer-only header", () => {
    const { url, init } = mineRequest("https://x.example", "t");
    expect(url).toBe("https://x.example/api/quizzes/mine");
    expect(init.method).toBeUndefined();
    expect(init.headers).toEqual({ Authorization: "Bearer t" });
  });

  it("getRequest encodes the id", () => {
    expect(getRequest("https://x.example", "t", "a/b").url).toBe(
      "https://x.example/api/quizzes/a%2Fb",
    );
  });

  it("meRequest GETs /api/auth/me", () => {
    expect(meRequest("https://x.example", "t").url).toBe("https://x.example/api/auth/me");
  });
});

describe("listOutcome", () => {
  it("prints one tab-separated line per quiz", () => {
    const o = listOutcome(200, {
      quizzes: [
        { id: "q1", status: "draft", title: "HTTP" },
        { id: "q2", status: "published", title: "TCP" },
      ],
    });
    expect(o.code).toBe(0);
    expect(o.stdout).toBe("q1\tdraft\tHTTP\nq2\tpublished\tTCP");
  });

  it("collapses whitespace in the title to keep one line per quiz", () => {
    const o = listOutcome(200, { quizzes: [{ id: "q1", status: "draft", title: "a\n b\tc" }] });
    expect(o.stdout).toBe("q1\tdraft\ta b c");
  });

  it("returns empty stdout (still success) for an empty pool", () => {
    expect(listOutcome(200, { quizzes: [] })).toEqual({ stdout: "", code: 0 });
  });

  it("maps 401 to a non-zero exit with a PAT hint", () => {
    expect(listOutcome(401, { error: "unauthorized" }).stderr).toContain("MAZUOBOERU_PAT");
  });
});

describe("getOutcome", () => {
  it("pretty-prints the quiz on 200", () => {
    const o = getOutcome(200, { quiz: { id: "q1", title: "t" } }, "q1");
    expect(o.code).toBe(0);
    expect(o.stdout).toBe(JSON.stringify({ id: "q1", title: "t" }, null, 2));
  });

  it("reports not_found on 404", () => {
    expect(getOutcome(404, { error: "not_found" }, "q1").stderr).toContain("not_found q1");
  });
});

describe("whoamiOutcome", () => {
  it("prints the user line on 200 with a user", () => {
    const o = whoamiOutcome(200, { user: { id: "u1", displayName: "Alice", role: "user" } });
    expect(o).toEqual({ stdout: "Alice (u1, user)", code: 0 });
  });

  it("treats 200 {user:null} as not authenticated (never-reject /auth/me)", () => {
    const o = whoamiOutcome(200, { user: null });
    expect(o.code).toBe(1);
    expect(o.stderr).toContain("not authenticated");
  });
});

describe("publishOutcome", () => {
  it("confirms on 200", () => {
    expect(publishOutcome(200, { ok: true }, "q1")).toEqual({ stdout: "published q1", code: 0 });
  });

  it("reports not_found on 404", () => {
    expect(publishOutcome(404, { error: "not_found" }, "q1")).toMatchObject({ code: 1 });
  });

  it("reports not_draft on 409", () => {
    expect(publishOutcome(409, { error: "not_draft" }, "q1").stderr).toContain("not_draft");
  });

  it("surfaces the gradeability errors on 422", () => {
    const o = publishOutcome(422, { error: "not_publishable", errors: ["no_questions"] }, "q1");
    expect(o.code).toBe(1);
    expect(o.stderr).toContain("not_publishable");
    expect(o.stderr).toContain("no_questions");
  });
});
