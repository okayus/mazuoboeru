-- Phase 3 Slice 2: Drill answers (ADR-0008). review_answer is the APPEND-ONLY log of
-- re-answering Review List questions — there is NO uniqueness guard (you drill the same
-- question many times, each a new row), and no attempt / score / completion (Drill is
-- stateless). is_correct is server-graded (gradeQuestion) and frozen. Feeds ALL private
-- dashboard metrics uniformly — streak / activity / accuracy; per-tag via a question->quiz
-- join at read time (ADR-0006, 2026-06-19). user_id CASCADEs (user-owned); question_id does
-- NOT cascade (history survives question edits, like attempt_answer). Plain table add — no
-- rebuild, no FK-OFF cascade risk (cloudflare-d1-drizzle-migration).
CREATE TABLE review_answer (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question(id),
  is_correct  INTEGER NOT NULL,
  answered_at INTEGER NOT NULL
);
CREATE INDEX idx_review_answer_user_answered ON review_answer (user_id, answered_at);
