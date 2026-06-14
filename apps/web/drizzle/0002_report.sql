-- Moderation report channel (Phase 1 MVP; mirrors worker/db/schema.ts `report`).
-- Additive only — a single CREATE TABLE on top of the applied 0001_phase1_slice.sql
-- baseline, so SQLite does no table rebuild and none of the D1 cascade-on-DROP trap
-- applies (see the cloudflare-d1-drizzle-migration skill). All timestamps epoch ms.
--
-- A user reports a quiz / question / user with a reason category + optional free text.
-- reporter_id CASCADEs (a deleted user's reports go with them). target_id is a plain
-- text id, deliberately NOT a foreign key: target_type selects the table it refers to,
-- and a report must outlive a soft-delete / hide of its target so a moderator can still
-- act on it. Triage is manual via `wrangler d1 execute` in MVP (admin UI is Phase 4);
-- see docs/data-model.md and docs/roadmap.md.

CREATE TABLE report (
  id               TEXT PRIMARY KEY NOT NULL,
  reporter_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  target_type      TEXT NOT NULL CHECK (target_type IN ('quiz','question','user')),
  target_id        TEXT NOT NULL,
  reason_category  TEXT NOT NULL CHECK (reason_category IN ('spam','sexual','violence','copyright','other')),
  reason_text      TEXT,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_report_status ON report (status, created_at);
CREATE INDEX idx_report_reporter ON report (reporter_id, created_at);
