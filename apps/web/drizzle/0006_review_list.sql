-- Phase 3 Slice 1: Review List (question-level manual pool) replaces the quiz-level
-- favorite (#47, ADR-0008). review_list is the private pool a user curates by hand;
-- the list view + Drill read it filtered to questions whose quiz is published & not
-- deleted. user_id CASCADEs (user-owned); question_id CASCADEs (part of the quiz
-- aggregate — fires only on a Phase 4 hard delete; soft-deleted / unpublished quizzes
-- are dropped at read time, not here). created_at orders the list (most recent first).
-- PK (user_id, question_id) makes add idempotent.
CREATE TABLE review_list (
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX idx_review_list_user ON review_list (user_id, created_at);

-- Drop the quiz-level favorite. It is a leaf table (nothing references it), so this is
-- a plain DROP — no table rebuild, no FK-OFF cascade (cf. cloudflare-d1-drizzle-migration).
-- Existing favorites are discarded: quiz-level → question-level can't map cleanly, and
-- this is dogfooding-only data (ADR-0008 "discard & re-register").
DROP TABLE favorite;
