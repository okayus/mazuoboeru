// Drizzle schema for the Phase 1 vertical slice.
//
// This is the query-time source of truth (drizzle-orm uses it for typed queries).
// The DDL — including CHECK constraints and the exact column order — lives in the
// hand-written migration `drizzle/0001_phase1_slice.sql`, which is what actually
// runs against D1. Keep the two in sync by hand for now (drizzle-kit generate is
// deferred until the schema stabilises; the existing applied `0000_init.sql`
// baseline makes a clean drizzle-kit re-baseline a later, separate task).
//
// Conventions: ids are text UUIDs (crypto.randomUUID); timestamps are epoch ms
// stored as integer; booleans are integer 0/1. See docs/data-model.md.

import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    // Public. Shown as the quiz author. Editable by the user.
    displayName: text("display_name").notNull(),
    // Private PII. Used for OAuth identity / notifications, never exposed publicly.
    email: text("email"),
    role: text("role", { enum: ["user", "moderator", "admin"] })
      .notNull()
      .default("user"),
    status: text("status", { enum: ["active", "suspended"] })
      .notNull()
      .default("active"),
    createdAt: integer("created_at").notNull(),
  },
);

// MVP auth method. (provider, provider_account_id) is the IdP-side stable identity.
// Auto-linking onto an existing user is allowed only when the *current* provider
// asserts the email is verified — see ADR-0001. That rule is enforced in app logic.
export const oauthAccount = sqliteTable(
  "oauth_account",
  {
    provider: text("provider", { enum: ["google", "github"] }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("idx_oauth_account_user").on(t.userId),
  ],
);

// Cookie-based web session. `id` stores sha256(token) hex — the raw token lives
// only in the browser cookie (ADR-0001). 30-day sliding expiry.
export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("idx_session_expires").on(t.expiresAt)],
);

// PAT for CLI / AI agents. `token_hash` = sha256(token + pepper); raw token shown
// once at creation. Format `mzo_pat_<base64url(32B)>`, default no expiry (ADR-0001).
export const apiToken = sqliteTable(
  "api_token",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopes: text("scopes").notNull(), // JSON array, e.g. ["quiz:read","quiz:write"]
    createdAt: integer("created_at").notNull(),
    lastUsedAt: integer("last_used_at"),
    expiresAt: integer("expires_at"),
    revokedAt: integer("revoked_at"),
  },
  (t) => [
    uniqueIndex("idx_api_token_hash").on(t.tokenHash),
    index("idx_api_token_user").on(t.userId, t.revokedAt),
  ],
);

// Quizzes are always public. status is draft|published|hidden (no `private`),
// draft->published is irreversible, hidden is moderator-only. deleted_at is soft
// delete. Public queries always filter status='published' AND deleted_at IS NULL.
// author_id intentionally does NOT cascade: a quiz outlives nothing of the author's
// here, and others' attempts reference it — author hard-delete is a Phase 4 flow.
export const quiz = sqliteTable(
  "quiz",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    description: text("description"), // Markdown, sanitized at render
    status: text("status", { enum: ["draft", "published", "hidden"] })
      .notNull()
      .default("draft"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    publishedAt: integer("published_at"),
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    index("idx_quiz_timeline").on(t.status, t.deletedAt, t.createdAt),
    index("idx_quiz_author").on(t.authorId),
  ],
);

// Part of the quiz aggregate (cascades from quiz).
export const question = sqliteTable(
  "question",
  {
    id: text("id").primaryKey(),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quiz.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["mcq_single", "mcq_multi"] }).notNull(),
    prompt: text("prompt").notNull(), // Markdown, sanitized at render
    explanation: text("explanation"), // revealed only after grading
    position: integer("position").notNull(),
  },
  (t) => [index("idx_question_quiz").on(t.quizId, t.position)],
);

// Part of the quiz aggregate (cascades from question). is_correct must NEVER be
// sent to the client before grading (anti-cheat — grading is server-authoritative).
export const choice = sqliteTable(
  "choice",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    isCorrect: integer("is_correct").notNull(), // 0|1
    position: integer("position").notNull(),
  },
  (t) => [index("idx_choice_question").on(t.questionId, t.position)],
);

// A user's run at a quiz. Private to the user. quiz_id does NOT cascade: attempt
// history is preserved independently of the quiz lifecycle (quiz uses soft delete).
export const attempt = sqliteTable(
  "attempt",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quiz.id),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"), // set once all questions answered
    score: integer("score"),
    total: integer("total"),
  },
  (t) => [
    index("idx_attempt_user_quiz").on(t.userId, t.quizId),
    index("idx_attempt_quiz").on(t.quizId),
  ],
);

// One graded submission per question per attempt (enforced by the unique index).
// is_correct is frozen at write time and never recomputed, even on quiz edits.
// question_id does NOT cascade: historical answers survive question changes.
export const attemptAnswer = sqliteTable(
  "attempt_answer",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempt.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id),
    response: text("response").notNull(), // JSON array of selected choice ids
    isCorrect: integer("is_correct").notNull(), // 0|1
    answeredAt: integer("answered_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_attempt_answer_unique").on(t.attemptId, t.questionId),
  ],
);

// Moderation report channel (Phase 1 MVP). A user reports a quiz/question/user with
// a reason category + optional free text. target_id is a free-text id (NOT an FK —
// target_type selects which table it points at) so a report survives a soft-delete /
// hide of its target, leaving the moderator something to act on. reporter_id cascades
// (a deleted user's reports go with them). Triage is manual via wrangler in MVP;
// Discord notify is Phase 2, admin UI Phase 4 (docs/data-model.md, roadmap.md).
export const report = sqliteTable(
  "report",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetType: text("target_type", { enum: ["quiz", "question", "user"] }).notNull(),
    targetId: text("target_id").notNull(),
    reasonCategory: text("reason_category", {
      enum: ["spam", "sexual", "violence", "copyright", "other"],
    }).notNull(),
    reasonText: text("reason_text"), // optional free text, max 500 chars (enforced in route)
    status: text("status", { enum: ["open", "actioned", "dismissed"] })
      .notNull()
      .default("open"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_report_status").on(t.status, t.createdAt), // moderator triage
    index("idx_report_reporter").on(t.reporterId, t.createdAt), // per-user rate-limit window
  ],
);

// Tags are quiz-level metadata (a minor, non-gradeable edit — ADR-0002). name_key
// is the unique identity (NFKC + trim + collapse + ASCII-lowercase, see
// worker/domain/tag.ts); name keeps display casing. Per-tag dashboard accuracy
// reads these (ADR-0006).
export const tag = sqliteTable(
  "tag",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("idx_tag_name_key").on(t.nameKey)],
);

// Quiz<->tag join, part of the quiz aggregate: quiz_id cascades (quiz uses soft
// delete, so this only fires on a Phase 4 hard delete); tag_id does NOT cascade
// (a tag outlives any one quiz). The (quiz_id, tag_id) PK indexes quiz_id as a
// prefix, so only the reverse tag_id index is declared.
export const quizTags = sqliteTable(
  "quiz_tags",
  {
    quizId: text("quiz_id")
      .notNull()
      .references(() => quiz.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id),
  },
  (t) => [
    primaryKey({ columns: [t.quizId, t.tagId] }),
    index("idx_quiz_tags_tag").on(t.tagId),
  ],
);

// Directed broader/narrower ("is-a") edge forming the tag DAG (ADR-0007). One row per
// (narrower ⊂ broader); multi-parent allowed. Effective tags are derived (upward closure)
// at read time — these rows are the stored truth, quiz_tags stays authored-only. Both ids
// CASCADE. (narrower_id, broader_id) PK covers narrower_id prefix; reverse broader_id
// index serves children/descendant traversal (worker/domain/tag-graph.ts).
export const tagEdge = sqliteTable(
  "tag_edge",
  {
    narrowerId: text("narrower_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
    broaderId: text("broader_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.narrowerId, t.broaderId] }),
    index("idx_tag_edge_broader").on(t.broaderId),
  ],
);

// A user's private, question-level Review List — the manual pool of questions to
// revisit (UI label "my hot list" — CONTEXT.md Review List; replaces the quiz-level
// favorite, ADR-0008). user_id CASCADEs (user-owned); question_id CASCADEs (part of
// the quiz aggregate, fires only on a Phase 4 hard delete — soft-deleted / unpublished
// quizzes are filtered at read time). created_at orders the list (most recent first).
export const reviewList = sqliteTable(
  "review_list",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.questionId] }),
    index("idx_review_list_user").on(t.userId, t.createdAt),
  ],
);

// A user's Drill answers — the append-only log of re-answering Review List questions
// (CONTEXT.md Drill; ADR-0008). Unlike attempt_answer there is NO uniqueness guard: every
// drill of a question is a new row (drill the same question many times), and there is no
// attempt / score / completion (Drill is stateless — ADR-0008). is_correct is server-graded
// (gradeQuestion) and frozen. Feeds ALL private-dashboard metrics uniformly — streak /
// activity / accuracy, per-tag via a question->quiz join at read time (ADR-0006, 2026-06-19).
// user_id CASCADEs (user-owned); question_id does NOT cascade (history survives question
// edits, like attempt_answer). idx (user_id, answered_at) drives streak / activity.
export const reviewAnswer = sqliteTable(
  "review_answer",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id),
    isCorrect: integer("is_correct").notNull(), // 0|1, server-graded
    answeredAt: integer("answered_at").notNull(),
  },
  (t) => [index("idx_review_answer_user_answered").on(t.userId, t.answeredAt)],
);

// Inferred row types for use across the worker (query results / inserts).
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type OauthAccount = typeof oauthAccount.$inferSelect;
export type ApiToken = typeof apiToken.$inferSelect;
export type Quiz = typeof quiz.$inferSelect;
export type Question = typeof question.$inferSelect;
export type Choice = typeof choice.$inferSelect;
export type Attempt = typeof attempt.$inferSelect;
export type AttemptAnswer = typeof attemptAnswer.$inferSelect;
export type Report = typeof report.$inferSelect;
export type Tag = typeof tag.$inferSelect;
export type TagEdge = typeof tagEdge.$inferSelect;
export type ReviewListRow = typeof reviewList.$inferSelect;
export type ReviewAnswer = typeof reviewAnswer.$inferSelect;
