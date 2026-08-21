import { describe, expect, it } from "vitest";
import { tagGraphJson } from "./tag-graph";

describe("tagGraphJson", () => {
  it("groups rows into quizzes (first-appearance order) and lists the tags by name", () => {
    // Rows arrive newest quiz first (the query's ORDER BY); q2 is the newer one.
    const rows = [
      { quizId: "q2", title: "B", tagId: "t-react", tagName: "react" },
      { quizId: "q2", title: "B", tagId: "t-js", tagName: "JS" },
      { quizId: "q1", title: "A", tagId: "t-js", tagName: "JS" },
    ];
    expect(tagGraphJson(rows)).toEqual({
      tags: [
        { id: "t-js", name: "JS" },
        { id: "t-react", name: "react" },
      ],
      quizzes: [
        { id: "q2", title: "B", tagIds: ["t-react", "t-js"] },
        { id: "q1", title: "A", tagIds: ["t-js"] },
      ],
    });
  });

  it("lists a tag once however many quizzes carry it, and collapses duplicate rows", () => {
    const rows = [
      { quizId: "q1", title: "A", tagId: "t", tagName: "T" },
      { quizId: "q1", title: "A", tagId: "t", tagName: "T" },
      { quizId: "q2", title: "B", tagId: "t", tagName: "T" },
    ];
    expect(tagGraphJson(rows)).toEqual({
      tags: [{ id: "t", name: "T" }],
      quizzes: [
        { id: "q1", title: "A", tagIds: ["t"] },
        { id: "q2", title: "B", tagIds: ["t"] },
      ],
    });
  });

  it("is empty for no rows", () => {
    expect(tagGraphJson([])).toEqual({ tags: [], quizzes: [] });
  });
});
