-- Phase 2 Slice A2: tag subsumption edges (hand-written; mirrors worker/db/schema.ts).
-- Additive only — pure CREATE TABLE on top of the applied baseline, so no SQLite table
-- rebuild and none of the D1 cascade-on-DROP trap (cloudflare-d1-drizzle-migration skill).
--
-- tag_edge is the directed broader/narrower ("is-a") relationship forming the tag DAG
-- (ADR-0007). One row per (narrower ⊂ broader); a tag may have many parents (multi-parent
-- DAG). Effective tags are DERIVED (upward closure) at read time — these rows are the only
-- stored truth; quiz_tags stays authored-only. Edges are curated by the operator
-- (moderator/admin) via `wrangler d1 execute` (no public write path / admin UI in MVP);
-- acyclicity is enforced at curation time (worker/domain/tag-graph.ts wouldCreateCycle).
-- Both ids CASCADE so an edge can't dangle if a tag is ever deleted. The (narrower_id,
-- broader_id) PK indexes narrower_id as a prefix (parents-of-X); the reverse broader_id
-- index serves children-of-X (descendant traversal / broad-tag filter).

CREATE TABLE tag_edge (
  narrower_id  TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  broader_id   TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (narrower_id, broader_id)
);
CREATE INDEX idx_tag_edge_broader ON tag_edge (broader_id);
