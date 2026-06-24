import { expect, test } from "@playwright/test";
import { AUTHOR, CHALLENGER } from "../fixtures";

// The Phase 1 vertical slice end-to-end, as a human uses it:
//   author logs in → creates a quiz → publishes → a DIFFERENT account challenges it
//   → the server grades the answer.
// Login is the seeded-session seam (see e2e/README.md): we set the session cookie to a
// token whose sha256 is a real session row. Everything else is the real UI + Worker.
test("author publishes a quiz; another account challenges it and is server-graded", async ({
  page,
  context,
  baseURL,
}) => {
  // --- log in as the author by injecting the seeded session cookie ---
  await context.addCookies([{ name: "session", value: AUTHOR.token, url: baseURL! }]);

  const title = `E2E ゴールデン ${Date.now()}`;
  await page.goto("/#/create");

  await page.getByPlaceholder("例: 日本の地理").fill(title);
  // First (and only) question card: prompt is its first textarea.
  await page.locator(".question-edit").first().locator("textarea").first().fill("2 + 2 は？");
  await page.getByPlaceholder("選択肢 1").fill("4");
  await page.getByPlaceholder("選択肢 2").fill("5");
  // Mark choice 1 ("4") correct — the radio in the first choice row.
  await page.locator(".choice-edit").first().locator('input[type="radio"]').check();

  await page.getByRole("button", { name: "保存して公開" }).click();

  // Lands on My Quizzes with the quiz published (not left as a draft).
  await expect(page).toHaveURL(/#\/mine$/);
  const card = page.locator(".quiz-list .card", { hasText: title });
  await expect(card.getByText("公開中")).toBeVisible();

  // Session survives a FULL reload — proves cookie wiring, not in-memory React state.
  await page.reload();
  await expect(page.locator("header")).toContainText(AUTHOR.displayName);

  // Grab the published quiz id from its challenge link.
  const href = await card.getByRole("link", { name: "挑戦画面を見る" }).getAttribute("href");
  const quizId = href?.split("/quiz/")[1];
  expect(quizId).toBeTruthy();

  // --- switch to a DIFFERENT account: publish→challenge→grade is cross-user ---
  await context.clearCookies();
  await context.addCookies([{ name: "session", value: CHALLENGER.token, url: baseURL! }]);

  // The challenger finds the quiz on the public timeline and opens it.
  await page.goto("/#/");
  await page.getByRole("heading", { name: title }).click();
  await expect(page).toHaveURL(new RegExp(`#/quiz/${quizId}$`));

  // Answer correctly → the SERVER grades (the client never had is_correct) → feedback.
  const question = page.locator(".question").first();
  await question.getByRole("radio", { name: "4" }).check();
  await question.getByRole("button", { name: "回答する" }).click();

  await expect(question.getByText("正解", { exact: true })).toBeVisible();
  // No per-run score any more (the Attempt entity is retired — ADR-0013). The quiz-scoped
  // Drill shows an advance affordance instead; on the last (here only) question it reads "完了".
  await expect(question.getByRole("button", { name: "完了" })).toBeVisible();
});
