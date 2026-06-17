-- Phase 2 C1: favorites (hand-written; mirrors worker/db/schema.ts). Additive only —
-- pure CREATE TABLE, no rebuild. A user's private collection of published quizzes to
-- revisit ("my hot" in the UI — CONTEXT.md Favorite). user_id CASCADEs (user-owned);
-- quiz_id is NO ACTION (cross-aggregate ref, mirroring attempt.quiz_id — the my-hot
-- list filters published anyway, and quiz hard-delete is a Phase 4 flow). created_at
-- orders the list (most-recently-favorited first).
CREATE TABLE favorite (
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  quiz_id    TEXT NOT NULL REFERENCES quiz(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, quiz_id)
);
CREATE INDEX idx_favorite_user ON favorite (user_id, created_at);
