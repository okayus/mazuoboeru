import { parseArgs, usageText } from "./cli.ts";
import {
  createOutcome,
  createRequest,
  DEFAULT_BASE_URL,
  type Outcome,
  publishOutcome,
  publishRequest,
} from "./request.ts";

// All I/O is injected so run() is exercisable with fakes (throw-less boundary).
export type Io = {
  env: (key: string) => string | undefined;
  readFile: (path: string) => Promise<string>;
  readStdin: () => Promise<string>;
  fetch: typeof globalThis.fetch;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
};

async function parseJsonResponse(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const json: unknown = await res.json();
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function emit(io: Io, outcome: Outcome): number {
  if (outcome.stdout !== undefined) io.stdout(outcome.stdout);
  if (outcome.stderr !== undefined) io.stderr(outcome.stderr);
  return outcome.code;
}

// Returns the process exit code. Never throws (network failures map to code 1).
export async function run(argv: readonly string[], io: Io): Promise<number> {
  const command = parseArgs(argv);

  if (command.kind === "help") {
    io.stdout(usageText());
    return 0;
  }
  if (command.kind === "usage-error") {
    io.stderr(command.message);
    return 2;
  }

  const token = io.env("MAZUOBOERU_PAT");
  if (!token) {
    io.stderr("MAZUOBOERU_PAT is required (mint one in the web Settings page)");
    return 2;
  }
  const baseUrl = io.env("MAZUOBOERU_BASE_URL") ?? DEFAULT_BASE_URL;

  try {
    if (command.kind === "create") {
      const raw = command.file === null ? await io.readStdin() : await io.readFile(command.file);
      // Fail fast on malformed input here, rather than as an opaque server 400.
      try {
        JSON.parse(raw);
      } catch {
        io.stderr("input is not valid JSON");
        return 2;
      }
      const { url, init } = createRequest(baseUrl, token, raw);
      const res = await io.fetch(url, init);
      return emit(io, createOutcome(res.status, await parseJsonResponse(res)));
    }

    const { url, init } = publishRequest(baseUrl, token, command.id);
    const res = await io.fetch(url, init);
    return emit(io, publishOutcome(res.status, await parseJsonResponse(res), command.id));
  } catch (err) {
    io.stderr(`network error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
