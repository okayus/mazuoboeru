import { groupTags } from "@mazuoboeru/core";

// The public tag-graph payload (ADR-0016): the published incidence table — every
// published quiz's authored tag set (newest first, no timeline cap) plus the tags on them.
// Deliberately raw: counts, co-occurrence, AND narrowing, Related Tags and the matching
// list are all derived on the client with the same @mazuoboeru/core functions the
// timeline's `?tags=` uses (pairwise counts alone could not give exact Related Tags for a
// 2+ selection). Quizzes without tags carry nothing into the graph and are absent.
export type TagGraphRow = {
  quizId: string;
  title: string;
  tagId: string;
  tagName: string;
};

export type TagGraphJson = {
  tags: Array<{ id: string; name: string }>;
  quizzes: Array<{ id: string; title: string; tagIds: string[] }>;
};

// Pure: rows (already filtered to published, non-deleted quizzes by the query — a tag's
// presence here is an existence signal, so drafts must never reach this function) →
// payload. Quiz order is the rows' first-appearance order; tags are sorted by name.
export function tagGraphJson(rows: readonly TagGraphRow[]): TagGraphJson {
  const titleById = new Map<string, string>();
  const nameById = new Map<string, string>();
  for (const r of rows) {
    titleById.set(r.quizId, r.title);
    nameById.set(r.tagId, r.tagName);
  }
  const items = groupTags(rows.map((r) => ({ itemId: r.quizId, tagId: r.tagId })));
  return {
    tags: [...nameById]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    quizzes: items.map((it) => ({
      id: it.id,
      title: titleById.get(it.id) ?? "",
      tagIds: [...it.tagIds],
    })),
  };
}
