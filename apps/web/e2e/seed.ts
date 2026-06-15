#!/usr/bin/env node
// Reset + seed the LOCAL e2e D1 database. Run by `pnpm run e2e:server` BEFORE
// `wrangler dev` starts, so there is never concurrent access to the sqlite file.
//
// Safety: every wrangler call hardcodes `--local` and a dedicated `--persist-to`
// state dir. This never touches --remote (production). (Skill: the e2e dev-reset
// must hardcode --local so a misconfigured run can't wipe prod D1.)
//
// Why we seed a session row instead of logging in: the only login is GitHub OAuth,
// whose server→github.com code exchange cannot run headlessly. Rather than add a
// production auth-bypass route (the e2e skill's documented anti-pattern), we insert a
// real session row whose id is sha256(token) — byte-for-byte what worker/auth/session.ts
// stores — and the specs send that token as the cookie. Production getSessionUser runs
// unchanged. See e2e/README.md.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { AUTHOR, CHALLENGER, DRAFT_QUIZ, type Fixture } from "./fixtures.ts";

const DB = "mazuoboeru-db";
const STATE = ".wrangler/state-e2e";
const SEED_SQL = ".wrangler/e2e-seed.sql";

// Mirrors worker/lib/crypto.ts sha256Hex: lowercase hex of sha256(utf8(token)).
const sessionId = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

const wrangler = (args: string[]): void => {
  if (args.includes("--remote")) throw new Error("refusing to run wrangler against --remote in e2e seed");
  execFileSync("pnpm", ["exec", "wrangler", ...args], {
    stdio: "inherit",
    env: { ...process.env, CI: "true" }, // non-interactive: skip the migration prompt
  });
};

const now = Date.now();
const sessionExpiry = now + 365 * 24 * 60 * 60 * 1000; // far beyond any test run

const userRow = (u: Fixture): string =>
  `INSERT INTO user (id, display_name, email, role, status, created_at) VALUES ('${u.id}', '${u.displayName}', '${u.email}', 'user', 'active', ${now});`;
const sessionRow = (u: Fixture): string =>
  `INSERT INTO session (id, user_id, created_at, last_seen_at, expires_at) VALUES ('${sessionId(u.token)}', '${u.id}', ${now}, ${now}, ${sessionExpiry});`;

// Children before parents (FK order). A full wipe keeps every run deterministic.
const reset = [
  "attempt_answer",
  "attempt",
  "choice",
  "question",
  "quiz",
  "report",
  "api_token",
  "oauth_account",
  "session",
  "user",
].map((t) => `DELETE FROM ${t};`);

const sql = [
  ...reset,
  userRow(AUTHOR),
  userRow(CHALLENGER),
  sessionRow(AUTHOR),
  sessionRow(CHALLENGER),
  // AUTHOR's draft (+ one gradeable question) for the authorization-boundary spec.
  `INSERT INTO quiz (id, author_id, title, description, status, created_at, updated_at, published_at, deleted_at) VALUES ('${DRAFT_QUIZ.id}', '${AUTHOR.id}', '${DRAFT_QUIZ.title}', NULL, 'draft', ${now}, ${now}, NULL, NULL);`,
  `INSERT INTO question (id, quiz_id, type, prompt, explanation, position) VALUES ('${DRAFT_QUIZ.questionId}', '${DRAFT_QUIZ.id}', 'mcq_single', '下書きの設問', NULL, 0);`,
  `INSERT INTO choice (id, question_id, text, is_correct, position) VALUES ('${DRAFT_QUIZ.choiceCorrectId}', '${DRAFT_QUIZ.questionId}', '正', 1, 0);`,
  `INSERT INTO choice (id, question_id, text, is_correct, position) VALUES ('${DRAFT_QUIZ.choiceWrongId}', '${DRAFT_QUIZ.questionId}', '誤', 0, 1);`,
].join("\n");

console.error(`e2e seed: applying migrations to ${STATE}`);
wrangler(["d1", "migrations", "apply", DB, "--local", "--persist-to", STATE]);

mkdirSync(".wrangler", { recursive: true });
writeFileSync(SEED_SQL, sql);
console.error("e2e seed: resetting tables + inserting fixtures");
wrangler(["d1", "execute", DB, "--local", "--persist-to", STATE, "--file", SEED_SQL]);
console.error("e2e seed: done");
