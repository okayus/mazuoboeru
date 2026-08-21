-- ADR-0016: tags are flat again — the subsumption DAG of ADR-0007 (migration 0004) is retired.
-- tag_edge is a CHILD table (both FKs point at tag), so dropping it cascades into nothing
-- (the D1 DROP trap only bites when a PARENT of CASCADE children is dropped). Its only
-- production row (HTTP ⊂ Protocol) is discarded on purpose. Tag relations are now derived
-- at read time from published quizzes (Related Tags, CONTEXT.md) and never stored.
-- SQLite drops the table's index (idx_tag_edge_broader) together with the table.

DROP TABLE tag_edge;
