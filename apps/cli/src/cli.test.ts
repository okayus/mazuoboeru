import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli.ts";

describe("parseArgs", () => {
  it("treats no args / help / -h / --help as help", () => {
    for (const argv of [[], ["help"], ["-h"], ["--help"]]) {
      expect(parseArgs(argv)).toEqual({ kind: "help" });
    }
  });

  it("parses create with a file", () => {
    expect(parseArgs(["create", "quiz.json"])).toEqual({ kind: "create", file: "quiz.json" });
  });

  it("parses create with no file as stdin (file === null)", () => {
    expect(parseArgs(["create"])).toEqual({ kind: "create", file: null });
  });

  it("rejects an option where a file is expected", () => {
    expect(parseArgs(["create", "--oops"])).toEqual({
      kind: "usage-error",
      message: "unknown option: --oops",
    });
  });

  it("parses publish with an id", () => {
    expect(parseArgs(["publish", "abc-123"])).toEqual({ kind: "publish", id: "abc-123" });
  });

  it("rejects publish without an id", () => {
    expect(parseArgs(["publish"])).toMatchObject({ kind: "usage-error" });
  });

  it("rejects an unknown command", () => {
    expect(parseArgs(["frobnicate"])).toEqual({
      kind: "usage-error",
      message: "unknown command: frobnicate",
    });
  });
});
