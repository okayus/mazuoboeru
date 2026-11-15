import { expect, test } from "@playwright/test";

// The reload screen, wired as shipped: main.tsx hands createRoot an onUncaughtError
// that renders FatalScreen. src/QuizMarkdown.tsx code-splits the markdown renderer
// with lazy(), so a tab left open across a deploy asks for a chunk that is gone: the
// import rejects, React rethrows it while rendering, and with no error boundary it
// unmounts the whole tree.
//
// Both halves are staged at the network, so the spec needs no account and writes no
// D1 row: a timeline whose quiz has a description, which makes the page ask for the
// chunk, and a 404 for the chunk.
test("a render error leaves the reload screen, not a blank page", async ({ page }) => {
  await page.route("**/api/public/quizzes", (route) =>
    route.fulfill({
      json: {
        quizzes: [
          {
            id: "fatal-quiz",
            title: "説明つきのクイズ",
            description: "説明",
            authorDisplayName: "e2e",
            publishedAt: 0,
            questionCount: 1,
            tags: [],
          },
        ],
        related: [],
      },
    }),
  );
  // Vite names the chunk after its module.
  await page.route("**/assets/QuizMarkdownRenderer-*.js", (route) =>
    route.fulfill({ status: 404 }),
  );

  const reported = page.waitForEvent("pageerror");
  await page.goto("/");
  const screen = page.getByRole("alert");
  await expect(screen.getByRole("heading", { name: "表示できませんでした" })).toBeVisible();
  // The app is gone, not hidden behind the message.
  await expect(page.locator("header")).toHaveCount(0);
  // Still reported as an uncaught error, which is what React's default handler does.
  expect((await reported).message).toContain("QuizMarkdownRenderer");

  // 再読み込み is a real reload: with the stubs lifted, the app comes back.
  await page.unrouteAll();
  await page.getByRole("button", { name: "再読み込み" }).click();
  await expect(page.getByRole("link", { name: "まず覚える", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
