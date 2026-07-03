// Pure argv parsing. No I/O. The boundary (index.ts/run.ts) executes the result.

export type ParsedCommand =
  | { kind: "create"; file: string | null } // file === null => read stdin
  | { kind: "publish"; id: string }
  | { kind: "list" }
  | { kind: "get"; id: string }
  | { kind: "whoami" }
  | { kind: "help" }
  | { kind: "usage-error"; message: string };

const USAGE = `mzo — まず覚える CLI (PAT でクイズを作成 / 公開)

Usage:
  mzo create [file.json]   クイズ JSON を作成 (省略時は stdin)。成功で draft の id を1行出力
  mzo publish <id>         draft を公開 (明示・不可逆)
  mzo list                 自分のクイズ一覧 (id<TAB>status<TAB>title の1行/件)
  mzo get <id>             クイズ1件を JSON で表示 (jq 可・全内容)
  mzo whoami               PAT の疎通確認 (認証中のユーザを表示)
  mzo help

Env:
  MAZUOBOERU_PAT           必須。Bearer トークン (mzo_pat_...)。Web の設定画面で発行
  MAZUOBOERU_BASE_URL      任意。既定は本番 (https://mazuoboeru.shiraoka.workers.dev)

Input は POST /api/quizzes の body そのもの (薄いパイプ・検証はサーバ側):
  {"title": "...", "description": "...",
   "questions": [{"type": "mcq_single", "prompt": "...", "explanation": "...",
                  "choices": [{"text": "...", "isCorrect": true}]}]}
`;

export function usageText(): string {
  return USAGE;
}

export function parseArgs(argv: readonly string[]): ParsedCommand {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
    case "help":
    case "-h":
    case "--help":
      return { kind: "help" };
    case "create": {
      const file = rest[0];
      if (file !== undefined && file.startsWith("-")) {
        return { kind: "usage-error", message: `unknown option: ${file}` };
      }
      return { kind: "create", file: file ?? null };
    }
    case "publish": {
      const id = rest[0];
      if (!id) {
        return { kind: "usage-error", message: "publish requires a quiz id: mzo publish <id>" };
      }
      return { kind: "publish", id };
    }
    case "list":
      return { kind: "list" };
    case "whoami":
      return { kind: "whoami" };
    case "get": {
      const id = rest[0];
      if (!id) {
        return { kind: "usage-error", message: "get requires a quiz id: mzo get <id>" };
      }
      return { kind: "get", id };
    }
    default:
      return { kind: "usage-error", message: `unknown command: ${command}` };
  }
}
