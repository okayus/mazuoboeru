// Pure argv parsing + help/usage-error formatting. No I/O. The boundary
// (index.ts/run.ts) executes the result.
import pkg from "../package.json" with { type: "json" };

const COMMAND_NAMES = ["create", "update", "publish", "list", "get", "whoami"] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];

export type ParsedCommand =
  | { kind: "create"; file: string | null } // file === null => read stdin
  | { kind: "update"; id: string; file: string | null } // file === null => read stdin
  | { kind: "publish"; id: string }
  | { kind: "list" }
  | { kind: "get"; id: string }
  | { kind: "whoami" }
  | { kind: "help"; topic: CommandName | null } // topic === null => global usage
  | { kind: "version" }
  | {
      kind: "usage-error";
      message: string;
      command: CommandName | null;
      suggestion: string | null;
    };

export type UsageError = Extract<ParsedCommand, { kind: "usage-error" }>;

// Single source of truth for per-command docs: the global usage table, the
// per-command help, and the usage line shown on argument errors all derive
// from here, so they cannot drift apart.
type CommandDoc = { usage: string; summary: string; details: string };

const COMMAND_DOCS: Record<CommandName, CommandDoc> = {
  create: {
    usage: "mzo create [file.json]",
    summary: "クイズ JSON を作成 (省略時は stdin)。成功で draft の id を1行出力",
    details: `入力は POST /api/quizzes の body そのもの (薄いパイプ・検証はサーバ側):
  {"title": "...", "description": "...",
   "questions": [{"type": "mcq_single", "prompt": "...", "explanation": "...",
                  "choices": [{"text": "...", "isCorrect": true}]},
                 {"type": "short", "prompt": "...", "answer": ["nsproxy"]}]}

常に draft を作る (公開は mzo publish が別途必要)。成功で新しい id だけを stdout に1行出す:
  id=$(mzo create quiz.json) && mzo publish "$id"
制約違反 (タイトル ≤200・設問 ≤100/クイズ・選択肢 ≤20/問 等) はサーバの 400 で、issues を stderr に出す。`,
  },
  update: {
    usage: "mzo update <id> [file.json]",
    summary: "クイズを丸ごと更新 (省略時は stdin)。公開済みも可 (ADR-0014)",
    details: `「望む最終形」を丸ごと送る (mzo get <id> の出力を編集して再送するのが基本):
  設問の "id" あり = その設問を上書き (type は変更不可 = 409)
  "id" なし       = 新しい設問を追加
  既存 id を省略  = 公開済みならその設問を引退 (retired・不可逆)、draft なら削除
  未知・重複 id   = 400 (黙って新規扱いにしない)
公開済みは採点可能性 (設問 ≥1・選択肢 ≥2＋正解・許容解 ≥1) を保つ必要があり、崩す編集は 422。
成功で diff サマリを stdout に1行出す: updated <id> updated:N added:N retired:N unchanged:N`,
  },
  publish: {
    usage: "mzo publish <id>",
    summary: "draft を公開 (明示・不可逆)",
    details: `draft → published の明示・不可逆な遷移。公開すると全ユーザに見え、非公開には戻せない。
採点可能でない draft (設問 0 件・正解の無い設問など) は 422 not_publishable で拒否される。
draft 以外 (公開済み等) への publish は 409 not_draft。`,
  },
  list: {
    usage: "mzo list",
    summary: "自分のクイズ一覧 (id<TAB>status<TAB>title の1行/件)",
    details: `1クイズ1行のタブ区切りで stdout に出す (cut/awk で合成できる):
  mzo list | grep -P '\\tdraft\\t' | cut -f1   # draft の id だけ
title 内の空白は単一スペースに畳む (1行/件の不変条件)。正確な title は mzo get で見る。`,
  },
  get: {
    usage: "mzo get <id>",
    summary: "クイズ1件を JSON で表示 (jq 可・全内容)",
    details: `作者視点のクイズ全体 (設問 id つき) を整形 JSON で stdout に出す (jq 可)。
mzo get <id> > quiz.json → 編集 → mzo update <id> quiz.json が round-trip する。
他人の / 存在しない id は 404。`,
  },
  whoami: {
    usage: "mzo whoami",
    summary: "PAT の疎通確認 (認証中のユーザを表示)",
    details: `GET /api/auth/me を呼び、PAT が有効なら認証中のユーザを1行で表示する。
未認証 (PAT が不正・失効・別環境の PAT) は "not authenticated" で exit 1。`,
  },
};

export function usageText(): string {
  const rows: readonly [string, string][] = [
    ...COMMAND_NAMES.map((n): [string, string] => [COMMAND_DOCS[n].usage, COMMAND_DOCS[n].summary]),
    ["mzo help [command]", "使い方を表示 (コマンド別の詳細も)"],
    ["mzo --version", "バージョンを表示"],
  ];
  const width = Math.max(...rows.map(([usage]) => usage.length)) + 3;
  const table = rows.map(([usage, summary]) => `  ${usage.padEnd(width)}${summary}`).join("\n");
  return `mzo — まず覚える CLI (PAT でクイズを作成 / 編集 / 公開)

Usage:
${table}

Env:
  MAZUOBOERU_PAT           必須。Bearer トークン (mzo_pat_...)。Web の設定画面で発行
  MAZUOBOERU_BASE_URL      任意。既定は本番 (https://mazuoboeru.shiraoka.workers.dev)

コマンド別の詳細 (入力 JSON の形・update の差分規則など): mzo help <command>
`;
}

export function helpText(topic: CommandName): string {
  const doc = COMMAND_DOCS[topic];
  return `mzo ${topic} — ${doc.summary}

Usage: ${doc.usage}

${doc.details}
`;
}

export function versionText(): string {
  return pkg.version;
}

export function usageErrorText(error: UsageError): string {
  const lines = [`error: ${error.message}`];
  if (error.suggestion !== null) lines.push(`Did you mean 'mzo ${error.suggestion}'?`);
  if (error.command !== null) {
    lines.push("", `Usage: ${COMMAND_DOCS[error.command].usage}`);
    lines.push("", `Run 'mzo help ${error.command}' for details.`);
  } else {
    lines.push("", "Run 'mzo help' for usage.");
  }
  return lines.join("\n");
}

function isCommandName(input: string): input is CommandName {
  return (COMMAND_NAMES as readonly string[]).includes(input);
}

// Levenshtein distance, two-row DP. Inputs are command-length strings.
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

// A unique prefix ("pub") or a near miss ("lst", edit distance <= 2) earns a
// Did-you-mean. Anything farther suggests nothing rather than something wrong.
export function suggestCommand(input: string): string | null {
  const candidates: readonly string[] = [...COMMAND_NAMES, "help"];
  if (input.length >= 2) {
    const prefixed = candidates.filter((name) => name.startsWith(input));
    if (prefixed.length === 1) return prefixed[0];
  }
  let best: string | null = null;
  let bestDistance = 3;
  for (const name of candidates) {
    const distance = editDistance(input, name);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = name;
    }
  }
  return best;
}

function unknownCommand(input: string): ParsedCommand {
  return {
    kind: "usage-error",
    message: `unknown command: ${input}`,
    command: null,
    suggestion: suggestCommand(input),
  };
}

function usageError(command: CommandName, message: string): ParsedCommand {
  return { kind: "usage-error", message, command, suggestion: null };
}

export function parseArgs(argv: readonly string[]): ParsedCommand {
  const [command, ...rest] = argv;
  if (command === undefined || command === "help" || command === "-h" || command === "--help") {
    const topic = command === "help" ? rest[0] : undefined;
    if (topic === undefined) return { kind: "help", topic: null };
    return isCommandName(topic) ? { kind: "help", topic } : unknownCommand(topic);
  }
  if (command === "--version" || command === "-v" || command === "version") {
    return { kind: "version" };
  }
  if (!isCommandName(command)) return unknownCommand(command);
  if (rest.includes("-h") || rest.includes("--help")) return { kind: "help", topic: command };

  const option = rest.find((arg) => arg.startsWith("-"));
  if (option !== undefined) return usageError(command, `unknown option: ${option}`);

  // Strict arity: a stray extra argument is an error, not silently ignored
  // (`mzo publish id1 id2` must not quietly publish only id1).
  switch (command) {
    case "create": {
      if (rest.length > 1) return usageError(command, `unexpected argument: ${rest[1]}`);
      return { kind: "create", file: rest[0] ?? null };
    }
    case "update": {
      const [id, file, extra] = rest;
      if (id === undefined) return usageError(command, "update requires a quiz id");
      if (extra !== undefined) return usageError(command, `unexpected argument: ${extra}`);
      return { kind: "update", id, file: file ?? null };
    }
    case "publish":
    case "get": {
      const [id, extra] = rest;
      if (id === undefined) return usageError(command, `${command} requires a quiz id`);
      if (extra !== undefined) return usageError(command, `unexpected argument: ${extra}`);
      return command === "publish" ? { kind: "publish", id } : { kind: "get", id };
    }
    case "list":
    case "whoami": {
      if (rest.length > 0) return usageError(command, `unexpected argument: ${rest[0]}`);
      return { kind: command };
    }
  }
}
