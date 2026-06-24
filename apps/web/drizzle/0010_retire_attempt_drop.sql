-- 0010: Retire Attempt — step 2 of 2: migrate attempt_answer into answer, drop attempt tables
-- (ADR-0013). Step 1 (0009) renamed review_answer -> answer; this carries the historical
-- Challenge answers across and removes the Attempt state machine for good.
--
-- The migrated facts (id, user_id, question_id, is_correct, answered_at) are exactly the columns
-- answer needs; attempt_answer.response (the submitted choice ids / text) is intentionally DROPPED
-- (ADR-0013: no response column — resume is gone, nothing reads it). user_id comes from the row's
-- attempt (attempt_answer has no user_id of its own). Each attempt_answer.id is reused as the
-- answer.id (both are crypto.randomUUID — collision-free).
--
-- FK safety (cloudflare-d1-drizzle-migration skill): migrate FIRST, then DROP child before parent.
-- attempt_answer is a leaf (nothing references it) and is the ONLY referrer of attempt, so dropping
-- it first leaves attempt unreferenced — both DROPs are FK-clean, no table rebuild, none of the
-- foreign_keys=OFF cascade trap the `question` rebuild hit (0008).
--
-- Host runbook before the first REMOTE apply (as #67/0008): take a `wrangler d1 export --remote`
-- of prod, dry-run this migration against that export, confirm answer row count grows by exactly
-- the attempt_answer count and foreign_key_check is clean, and keep the export as the backup.
INSERT INTO answer (id, user_id, question_id, is_correct, answered_at)
  SELECT aa.id, a.user_id, aa.question_id, aa.is_correct, aa.answered_at
  FROM attempt_answer aa
  JOIN attempt a ON aa.attempt_id = a.id;

DROP TABLE attempt_answer;
DROP TABLE attempt;
