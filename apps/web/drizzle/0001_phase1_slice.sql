-- Phase 1 vertical slice schema (hand-written; mirrors worker/db/schema.ts).
-- Additive only — pure CREATE TABLE on top of the already-applied 0000_init.sql
-- baseline, so no SQLite table rebuild and none of the D1 cascade-on-DROP trap
-- (see the cloudflare-d1-drizzle-migration skill). All timestamps are epoch ms.
--
-- onDelete policy: CASCADE only within true aggregates (quiz>question>choice,
-- attempt>attempt_answer) and for user-owned auth/session/token/attempt. Cross-
-- aggregate references (quiz.author_id, attempt.quiz_id, attempt_answer.question_id)
-- use the default NO ACTION to preserve public content + historical answers; author
-- and quiz hard-delete are Phase 4 flows (ADR-0002).

CREATE TABLE user (
  id            TEXT PRIMARY KEY NOT NULL,
  display_name  TEXT NOT NULL,
  email         TEXT,
  role          TEXT NOT NULL DEFAULT 'user'   CHECK (role IN ('user','moderator','admin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at    INTEGER NOT NULL
);

CREATE TABLE oauth_account (
  provider             TEXT NOT NULL CHECK (provider IN ('google','github')),
  provider_account_id  TEXT NOT NULL,
  user_id              TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_at           INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_account_id)
);
CREATE INDEX idx_oauth_account_user ON oauth_account (user_id);

CREATE TABLE session (
  id            TEXT PRIMARY KEY NOT NULL,
  user_id       TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);
CREATE INDEX idx_session_expires ON session (expires_at);

CREATE TABLE api_token (
  id           TEXT PRIMARY KEY NOT NULL,
  user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL,
  scopes       TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at   INTEGER,
  revoked_at   INTEGER
);
CREATE UNIQUE INDEX idx_api_token_hash ON api_token (token_hash);
CREATE INDEX idx_api_token_user ON api_token (user_id, revoked_at);

CREATE TABLE quiz (
  id            TEXT PRIMARY KEY NOT NULL,
  author_id     TEXT NOT NULL REFERENCES user(id),
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','hidden')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  published_at  INTEGER,
  deleted_at    INTEGER
);
CREATE INDEX idx_quiz_timeline ON quiz (status, deleted_at, created_at);
CREATE INDEX idx_quiz_author ON quiz (author_id);

CREATE TABLE question (
  id           TEXT PRIMARY KEY NOT NULL,
  quiz_id      TEXT NOT NULL REFERENCES quiz(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('mcq_single','mcq_multi')),
  prompt       TEXT NOT NULL,
  explanation  TEXT,
  position     INTEGER NOT NULL
);
CREATE INDEX idx_question_quiz ON question (quiz_id, position);

CREATE TABLE choice (
  id           TEXT PRIMARY KEY NOT NULL,
  question_id  TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  "text"       TEXT NOT NULL,
  is_correct   INTEGER NOT NULL CHECK (is_correct IN (0,1)),
  position     INTEGER NOT NULL
);
CREATE INDEX idx_choice_question ON choice (question_id, position);

CREATE TABLE attempt (
  id           TEXT PRIMARY KEY NOT NULL,
  user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  quiz_id      TEXT NOT NULL REFERENCES quiz(id),
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER,
  score        INTEGER,
  total        INTEGER
);
CREATE INDEX idx_attempt_user_quiz ON attempt (user_id, quiz_id);
CREATE INDEX idx_attempt_quiz ON attempt (quiz_id);

CREATE TABLE attempt_answer (
  id           TEXT PRIMARY KEY NOT NULL,
  attempt_id   TEXT NOT NULL REFERENCES attempt(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL REFERENCES question(id),
  response     TEXT NOT NULL,
  is_correct   INTEGER NOT NULL CHECK (is_correct IN (0,1)),
  answered_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_attempt_answer_unique ON attempt_answer (attempt_id, question_id);
