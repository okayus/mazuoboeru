#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { type Io, run } from "./run.ts";

async function readStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

const io: Io = {
  env: (key) => process.env[key],
  readFile: (path) => readFile(path, "utf8"),
  readStdin,
  fetch: (...args) => fetch(...args),
  stdout: (line) => process.stdout.write(line.endsWith("\n") ? line : `${line}\n`),
  stderr: (line) => process.stderr.write(line.endsWith("\n") ? line : `${line}\n`),
};

run(process.argv.slice(2), io).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  },
);
