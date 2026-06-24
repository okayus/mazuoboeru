-- 0009: Retire Attempt — step 1 of 2: rename review_answer -> answer (ADR-0013).
--
-- The single flat Answer table (id, user_id, question_id, is_correct, answered_at) is just
-- review_answer renamed: review_answer ALREADY has that exact shape, and it is a LEAF table
-- (nothing FK-references it), so this is a plain RENAME — no table rebuild, no implicit-DELETE
-- cascade, none of the PRAGMA foreign_keys=OFF trap the `question` rebuild hit (0008,
-- cloudflare-d1-drizzle-migration skill).
--
-- This step ONLY renames. The attempt / attempt_answer data migration + DROP is step 2 (0010),
-- which runs AFTER the Challenge UI is replaced by a quiz-scoped Drill — so the Challenge flow
-- (which still writes attempt_answer until then) never loses its source mid-flight
-- (no-regression order, ADR-0013). Between these two steps the dashboard reads
-- answer ∪ attempt_answer: no overlap, no double count, because nothing is migrated yet.
ALTER TABLE review_answer RENAME TO answer;

-- The index survives the table rename keeping its OLD name; drop + recreate so the name tracks
-- the table. Index-only rebuild — cheap, no table rebuild.
DROP INDEX idx_review_answer_user_answered;
CREATE INDEX idx_answer_user_answered ON answer (user_id, answered_at);
