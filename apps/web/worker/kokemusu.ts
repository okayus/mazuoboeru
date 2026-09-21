import type { KokemusuPost } from "./domain/kokemusu-post";

// Outbound boundary to kokemusu, the author's diary service (ADR-0017). Deliberately
// throw-less: this runs inside the cron, and kokemusu being down must not take the
// heartbeat or future sibling jobs with it. No retry either — the receiver has no
// Idempotency-Key, so a retry can double-post; a missed day stays missed and the
// next day's cron posts the next stone. Logs the HTTP status — and, on a non-2xx, the
// first characters of the RESPONSE body: a platform error names itself there
// ("error code: 1042" stayed invisible for two weeks while only "404" was logged,
// ADR-0017 補記 2026-09-21). Never the token, never the request body.
//
// Returns the HTTP status, or null when the request itself failed (network error).
export async function postWithBearer(
  url: string,
  token: string,
  payload: KokemusuPost,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const endpoint = `${url.replace(/\/+$/, "")}/api/posts`;
  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      // Bearer is CSRF-exempt on the receiver, so no Origin header is needed.
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const detail = res.ok ? "" : ` ${await responseSnippet(res)}`;
    console.log(`[kokemusu] POST /api/posts -> ${res.status}${detail}`);
    return res.status;
  } catch (e) {
    console.log("[kokemusu] push failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

// What the far end said, flattened to one short line. Reading the body can itself
// fail (a reset mid-response); that must not turn a logged 4xx into a thrown error.
const SNIPPET_MAX = 160;
async function responseSnippet(res: Response): Promise<string> {
  try {
    return (await res.text()).replace(/\s+/g, " ").trim().slice(0, SNIPPET_MAX);
  } catch {
    return "(unreadable response body)";
  }
}
