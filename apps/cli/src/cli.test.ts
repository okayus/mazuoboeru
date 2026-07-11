import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import {
  helpText,
  parseArgs,
  suggestCommand,
  usageErrorText,
  usageText,
  versionText,
} from "./cli.ts";

describe("parseArgs", () => {
  it("treats no args / help / -h / --help as global help", () => {
    for (const argv of [[], ["help"], ["-h"], ["--help"]]) {
      expect(parseArgs(argv)).toEqual({ kind: "help", topic: null });
    }
  });

  it("parses per-command help: help <cmd> and <cmd> --help / -h", () => {
    expect(parseArgs(["help", "create"])).toEqual({ kind: "help", topic: "create" });
    expect(parseArgs(["create", "--help"])).toEqual({ kind: "help", topic: "create" });
    expect(parseArgs(["update", "q1", "-h"])).toEqual({ kind: "help", topic: "update" });
  });

  it("treats help for an unknown command as a usage error with a suggestion", () => {
    expect(parseArgs(["help", "pubish"])).toEqual({
      kind: "usage-error",
      message: "unknown command: pubish",
      command: null,
      suggestion: "publish",
    });
  });

  it("parses --version / -v / version", () => {
    for (const argv of [["--version"], ["-v"], ["version"]]) {
      expect(parseArgs(argv)).toEqual({ kind: "version" });
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
      command: "create",
      suggestion: null,
    });
  });

  it("parses update with id + file, and id-only as stdin", () => {
    expect(parseArgs(["update", "q1", "quiz.json"])).toEqual({
      kind: "update",
      id: "q1",
      file: "quiz.json",
    });
    expect(parseArgs(["update", "q1"])).toEqual({ kind: "update", id: "q1", file: null });
  });

  it("rejects update without an id, or with options", () => {
    expect(parseArgs(["update"])).toMatchObject({
      kind: "usage-error",
      message: "update requires a quiz id",
      command: "update",
    });
    expect(parseArgs(["update", "-f"]).kind).toBe("usage-error");
    expect(parseArgs(["update", "q1", "--force"]).kind).toBe("usage-error");
  });

  it("parses publish with an id", () => {
    expect(parseArgs(["publish", "abc-123"])).toEqual({ kind: "publish", id: "abc-123" });
  });

  it("rejects publish without an id", () => {
    expect(parseArgs(["publish"])).toMatchObject({ kind: "usage-error", command: "publish" });
  });

  it("rejects stray extra arguments instead of silently ignoring them", () => {
    expect(parseArgs(["publish", "q1", "q2"])).toMatchObject({
      kind: "usage-error",
      message: "unexpected argument: q2",
      command: "publish",
    });
    expect(parseArgs(["create", "a.json", "b.json"]).kind).toBe("usage-error");
    expect(parseArgs(["update", "q1", "a.json", "b.json"]).kind).toBe("usage-error");
    expect(parseArgs(["list", "x"]).kind).toBe("usage-error");
    expect(parseArgs(["get", "q1", "q2"]).kind).toBe("usage-error");
    expect(parseArgs(["whoami", "x"]).kind).toBe("usage-error");
  });

  it("suggests the nearest command on a typo (edit distance)", () => {
    expect(parseArgs(["lst"])).toEqual({
      kind: "usage-error",
      message: "unknown command: lst",
      command: null,
      suggestion: "list",
    });
  });

  it("suggests on a unique prefix", () => {
    expect(parseArgs(["pub"])).toMatchObject({ kind: "usage-error", suggestion: "publish" });
    expect(parseArgs(["who"])).toMatchObject({ kind: "usage-error", suggestion: "whoami" });
  });

  it("suggests nothing for a far-off unknown command", () => {
    expect(parseArgs(["frobnicate"])).toEqual({
      kind: "usage-error",
      message: "unknown command: frobnicate",
      command: null,
      suggestion: null,
    });
  });
});

describe("suggestCommand", () => {
  it("matches near misses within edit distance 2", () => {
    expect(suggestCommand("craete")).toBe("create");
    expect(suggestCommand("gt")).toBe("get");
    expect(suggestCommand("hlep")).toBe("help");
  });

  it("returns null when nothing is close", () => {
    expect(suggestCommand("delete")).toBe(null);
  });
});

describe("help/version/usage-error text", () => {
  it("global usage lists every command plus help and --version", () => {
    const text = usageText();
    for (const name of ["create", "update", "publish", "list", "get", "whoami"]) {
      expect(text).toContain(`mzo ${name}`);
    }
    expect(text).toContain("mzo help [command]");
    expect(text).toContain("--version");
    expect(text).toContain("MAZUOBOERU_PAT");
  });

  it("per-command help carries the synopsis and the details", () => {
    const text = helpText("update");
    expect(text).toContain("Usage: mzo update <id> [file.json]");
    expect(text).toContain("retired");
    expect(helpText("create")).toContain("POST /api/quizzes");
  });

  it("versionText returns the package.json version", () => {
    expect(versionText()).toBe(pkg.version);
    expect(versionText()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("formats an unknown command with Did-you-mean and a global help pointer", () => {
    const parsed = parseArgs(["lst"]);
    if (parsed.kind !== "usage-error") throw new Error("expected usage-error");
    const text = usageErrorText(parsed);
    expect(text).toContain("error: unknown command: lst");
    expect(text).toContain("Did you mean 'mzo list'?");
    expect(text).toContain("Run 'mzo help' for usage.");
  });

  it("formats a command arg error with that command's usage line", () => {
    const parsed = parseArgs(["update"]);
    if (parsed.kind !== "usage-error") throw new Error("expected usage-error");
    const text = usageErrorText(parsed);
    expect(text).toContain("error: update requires a quiz id");
    expect(text).toContain("Usage: mzo update <id> [file.json]");
    expect(text).toContain("Run 'mzo help update' for details.");
    expect(text).not.toContain("Did you mean");
  });
});
