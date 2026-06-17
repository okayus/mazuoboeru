-- Phase 2 Slice A: tags (hand-written; mirrors worker/db/schema.ts).
-- Additive only — pure CREATE TABLE on top of the applied baseline, so no SQLite
-- table rebuild and none of the D1 cascade-on-DROP trap (cloudflare-d1-drizzle-
-- migration skill). All timestamps are epoch ms.
--
-- Tag identity: name_key (NFKC + trim + collapsed whitespace + ASCII-lowercased)
-- is the unique key, so "Docker"/"DOCKER"/"docker" collapse to one tag while name
-- keeps display casing (worker/domain/tag.ts). Tags are quiz-level metadata (a
-- minor, non-gradeable edit per ADR-0002); per-tag dashboard accuracy reads them
-- (ADR-0006). quiz_tags is part of the quiz aggregate → quiz_id CASCADEs (quiz uses
-- soft delete, so this only fires on a Phase 4 hard delete); tag_id is NO ACTION (a
-- tag's lifecycle is independent of any one quiz). The (quiz_id, tag_id) PK already
-- indexes quiz_id as a prefix, so only the tag_id reverse index is added.

CREATE TABLE tag (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL,
  name_key   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_tag_name_key ON tag (name_key);

CREATE TABLE quiz_tags (
  quiz_id  TEXT NOT NULL REFERENCES quiz(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tag(id),
  PRIMARY KEY (quiz_id, tag_id)
);
CREATE INDEX idx_quiz_tags_tag ON quiz_tags (tag_id);
