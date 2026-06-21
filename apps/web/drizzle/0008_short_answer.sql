-- 0008: add question.answer + allow type='short' (Short Answer / 一問一答; ADR-0012).
--
-- Adds question.answer (JSON {"accept":[...]}; NULL for mcq) and widens the type CHECK to
-- include 'short'. SQLite can't ALTER a CHECK, so `question` must be recreated.
--
-- D1/SQLite FK hazard (cloudflare-d1-drizzle-migration skill): `question` is referenced by
-- four children — choice + review_list (ON DELETE CASCADE) and attempt_answer + review_answer
-- (NO ACTION). A `DROP TABLE question` does an implicit DELETE of every row, which (a)
-- cascade-deletes choice + review_list and (b) violates the NO ACTION refs. `PRAGMA
-- foreign_keys=OFF` can't save us (D1 ignores it — the trap), and defer_foreign_keys does NOT
-- span this migration's statements (each commits on its own — verified: the drop fails with FK
-- enforcement on). So we keep FK enforcement ON and just never leave a dangling reference:
-- REPOINT every child onto the new table FIRST (each child is a leaf or holds only outgoing
-- FKs, so its own rebuild cascades nothing), THEN drop the now-unreferenced old `question` and
-- rename the new one into place (SQLite rewrites the children's FK target on RENAME). choice +
-- review_list also get demoted CASCADE→NO ACTION here so future question rebuilds (boolean,
-- cloze) stay cascade-safe; the matching app-level cleanup is in replaceDraftContent.
--
-- Verified locally with `pnpm db:migrate` (miniflare enforces FKs like D1). Still take a
-- `wrangler d1 export --remote` backup before the first remote apply (host-supervised; runbook).

-- New question table (answer column + widened CHECK). Children get repointed onto it below.
CREATE TABLE question_new (
  id           TEXT PRIMARY KEY NOT NULL,
  quiz_id      TEXT NOT NULL REFERENCES quiz(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('mcq_single','mcq_multi','short')),
  prompt       TEXT NOT NULL,
  explanation  TEXT,
  answer       TEXT,
  position     INTEGER NOT NULL
);
INSERT INTO question_new (id, quiz_id, type, prompt, explanation, answer, position)
  SELECT id, quiz_id, type, prompt, explanation, NULL, position FROM question;

-- choice → question_new, and CASCADE → NO ACTION (durable: future question rebuilds won't
-- cascade-delete it). Leaf table, so its own DROP cascades nothing.
CREATE TABLE choice_new (
  id           TEXT PRIMARY KEY NOT NULL,
  question_id  TEXT NOT NULL REFERENCES question_new(id),
  "text"       TEXT NOT NULL,
  is_correct   INTEGER NOT NULL CHECK (is_correct IN (0,1)),
  position     INTEGER NOT NULL
);
INSERT INTO choice_new (id, question_id, "text", is_correct, position)
  SELECT id, question_id, "text", is_correct, position FROM choice;
DROP TABLE choice;
ALTER TABLE choice_new RENAME TO choice;
CREATE INDEX idx_choice_question ON choice (question_id, position);

-- review_list → question_new, question_id CASCADE → NO ACTION (user_id keeps CASCADE).
CREATE TABLE review_list_new (
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question_new(id),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, question_id)
);
INSERT INTO review_list_new (user_id, question_id, created_at)
  SELECT user_id, question_id, created_at FROM review_list;
DROP TABLE review_list;
ALTER TABLE review_list_new RENAME TO review_list;
CREATE INDEX idx_review_list_user ON review_list (user_id, created_at);

-- attempt_answer → question_new (stays NO ACTION; attempt_id keeps CASCADE). History preserved.
CREATE TABLE attempt_answer_new (
  id           TEXT PRIMARY KEY NOT NULL,
  attempt_id   TEXT NOT NULL REFERENCES attempt(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL REFERENCES question_new(id),
  response     TEXT NOT NULL,
  is_correct   INTEGER NOT NULL CHECK (is_correct IN (0,1)),
  answered_at  INTEGER NOT NULL
);
INSERT INTO attempt_answer_new (id, attempt_id, question_id, response, is_correct, answered_at)
  SELECT id, attempt_id, question_id, response, is_correct, answered_at FROM attempt_answer;
DROP TABLE attempt_answer;
ALTER TABLE attempt_answer_new RENAME TO attempt_answer;
CREATE UNIQUE INDEX idx_attempt_answer_unique ON attempt_answer (attempt_id, question_id);

-- review_answer → question_new (stays NO ACTION; user_id keeps CASCADE). History preserved.
CREATE TABLE review_answer_new (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question_new(id),
  is_correct  INTEGER NOT NULL,
  answered_at INTEGER NOT NULL
);
INSERT INTO review_answer_new (id, user_id, question_id, is_correct, answered_at)
  SELECT id, user_id, question_id, is_correct, answered_at FROM review_answer;
DROP TABLE review_answer;
ALTER TABLE review_answer_new RENAME TO review_answer;
CREATE INDEX idx_review_answer_user_answered ON review_answer (user_id, answered_at);

-- Old `question` now has no referrers (all four children point at question_new). Drop it and
-- rename the new table into place — RENAME rewrites every child's FK target back to `question`.
DROP TABLE question;
ALTER TABLE question_new RENAME TO question;
CREATE INDEX idx_question_quiz ON question (quiz_id, position);
