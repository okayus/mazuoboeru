// Pure HTTP-shape helpers. No fetch here — the boundary performs the call and
// passes (status, parsed-json) back into the interpreters, so the whole protocol
// is testable without a network.

export const DEFAULT_BASE_URL = "https://mazuoboeru.shiraoka.workers.dev";

export type HttpRequest = { url: string; init: RequestInit };

// What the boundary should do after a response: print stdout (if any) and/or
// stderr (if any), then exit with code (0 = success).
export type Outcome = { stdout?: string; stderr?: string; code: number };

type Json = Record<string, unknown> | null;

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// GET requests carry only the bearer token (no body, no Content-Type).
function getHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, "") + path;
}

// body is the raw JSON text of a POST /api/quizzes request (the exact API shape).
export function createRequest(baseUrl: string, token: string, body: string): HttpRequest {
  return {
    url: joinUrl(baseUrl, "/api/quizzes"),
    init: { method: "POST", headers: authHeaders(token), body },
  };
}

export function publishRequest(baseUrl: string, token: string, id: string): HttpRequest {
  return {
    url: joinUrl(baseUrl, `/api/quizzes/${encodeURIComponent(id)}/publish`),
    init: { method: "POST", headers: authHeaders(token) },
  };
}

// Read-only requests (list / get / whoami). All accept a PAT (Bearer).
export function mineRequest(baseUrl: string, token: string): HttpRequest {
  return { url: joinUrl(baseUrl, "/api/quizzes/mine"), init: { headers: getHeaders(token) } };
}

export function getRequest(baseUrl: string, token: string, id: string): HttpRequest {
  return {
    url: joinUrl(baseUrl, `/api/quizzes/${encodeURIComponent(id)}`),
    init: { headers: getHeaders(token) },
  };
}

export function meRequest(baseUrl: string, token: string): HttpRequest {
  return { url: joinUrl(baseUrl, "/api/auth/me"), init: { headers: getHeaders(token) } };
}

function failureLine(status: number, body: Json): string {
  const code = body && typeof body.error === "string" ? body.error : `http_${status}`;
  let detail = "";
  if (body && body.issues !== undefined) detail = ` ${JSON.stringify(body.issues)}`;
  else if (body && body.errors !== undefined) detail = ` ${JSON.stringify(body.errors)}`;
  const hint =
    status === 401
      ? " (check MAZUOBOERU_PAT)"
      : status === 403
        ? " (insufficient scope or wrong account)"
        : "";
  return `error: ${code}${detail}${hint}`;
}

export function createOutcome(status: number, body: Json): Outcome {
  if (status === 201 && body && typeof body.id === "string") {
    return { stdout: body.id, code: 0 };
  }
  return { stderr: failureLine(status, body), code: 1 };
}

export function publishOutcome(status: number, body: Json, id: string): Outcome {
  if (status === 200) return { stdout: `published ${id}`, code: 0 };
  if (status === 404) return { stderr: `error: not_found ${id}`, code: 1 };
  if (status === 409) {
    return { stderr: `error: not_draft ${id} (already published, or not a draft)`, code: 1 };
  }
  return { stderr: failureLine(status, body), code: 1 };
}

// One tab-separated line per quiz: `id<TAB>status<TAB>title`. Composable
// (`mzo list | cut -f1`) and scannable. Whitespace in the (UGC) title is
// collapsed to a single space so the one-quiz-per-line invariant always holds;
// use `mzo get <id>` for the exact title.
function quizLine(q: Record<string, unknown>): string {
  const id = typeof q.id === "string" ? q.id : "?";
  const status = typeof q.status === "string" ? q.status : "?";
  const title = typeof q.title === "string" ? q.title.replace(/\s+/g, " ").trim() : "";
  return `${id}\t${status}\t${title}`;
}

export function listOutcome(status: number, body: Json): Outcome {
  if (status === 200 && body && Array.isArray(body.quizzes)) {
    const quizzes = body.quizzes as Record<string, unknown>[];
    // Empty pool => no output, still success (parseable by callers).
    return { stdout: quizzes.map(quizLine).join("\n"), code: 0 };
  }
  return { stderr: failureLine(status, body), code: 1 };
}

export function getOutcome(status: number, body: Json, id: string): Outcome {
  if (status === 200 && body && typeof body.quiz === "object" && body.quiz !== null) {
    return { stdout: JSON.stringify(body.quiz, null, 2), code: 0 };
  }
  if (status === 404) return { stderr: `error: not_found ${id}`, code: 1 };
  return { stderr: failureLine(status, body), code: 1 };
}

// /auth/me never rejects (optionalAuth): an absent/invalid PAT yields 200
// {user:null}, so authentication is decided by the body, not the status.
export function whoamiOutcome(status: number, body: Json): Outcome {
  if (status === 200 && body) {
    const user = body.user;
    if (user && typeof user === "object") {
      const u = user as Record<string, unknown>;
      return { stdout: `${String(u.displayName)} (${String(u.id)}, ${String(u.role)})`, code: 0 };
    }
    return { stderr: "not authenticated (check MAZUOBOERU_PAT)", code: 1 };
  }
  return { stderr: failureLine(status, body), code: 1 };
}
