import { expect, test } from "@playwright/test";

// Catches `app.use("*", securityHeaders)` being narrowed (e.g. to "/api/*") — the
// headers must ride EVERY response: the SPA shell, a pure Worker route, and an API
// error. We assert the environment-independent directives; the strict prod CSP
// (script-src 'self', HSTS) keys off an https ORIGIN, so it is verified by prod curl
// (docs/project-status.md "確かめ方"), not this http://localhost run — see README.
function expectSecurityHeaders(h: Record<string, string>): void {
  const csp = h["content-security-policy"];
  expect(csp).toBeTruthy();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
}

test("security headers on the SPA shell (/)", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  expectSecurityHeaders(res.headers());
});

test("security headers on a pure Worker route (/health)", async ({ request }) => {
  const res = await request.get("/health");
  expect(res.status()).toBe(200);
  expectSecurityHeaders(res.headers());
});

test("security headers on an API error (401)", async ({ request }) => {
  const res = await request.get("/api/quizzes/mine");
  expect(res.status()).toBe(401);
  expectSecurityHeaders(res.headers());
});
