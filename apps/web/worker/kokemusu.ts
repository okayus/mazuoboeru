import type { KokemusuPost } from "./domain/kokemusu-post";

// Outbound boundary to kokemusu, the author's diary service (ADR-0017). Deliberately
// throw-less: this runs inside the cron, and kokemusu being down must not take the
// heartbeat or future sibling jobs with it. No retry either — the receiver has no
// Idempotency-Key, so a retry can double-post; a missed day stays missed and the
// next day's cron posts the next stone. Logs the HTTP status only: never the token,
// never the body.
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
    console.log(`[kokemusu] POST /api/posts -> ${res.status}`);
    return res.status;
  } catch (e) {
    console.log("[kokemusu] push failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
