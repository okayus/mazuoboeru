// Pure argv parsing. No I/O. The boundary (index.ts/run.ts) executes the result.

export type ParsedCommand =
  | { kind: "create"; file: string | null } // file === null => read stdin
  | { kind: "update"; id: string; file: string | null } // file === null => read stdin
  | { kind: "publish"; id: string }
  | { kind: "list" }
  | { kind: "get"; id: string }
  | { kind: "whoami" }
  | { kind: "help" }
  | { kind: "usage-error"; message: string };

const USAGE = `mzo — まず覚える CLI (PAT でクイズを作成 / 編集 / 公開)

Usage:
  mzo create [file.json]        クイズ JSON を作成 (省略時は stdin)。成功で draft の id を1行出力
  mzo update <id> [file.json]   クイズを丸ごと更新 (省略時は stdin)。公開済みも可 (ADR-0014)
  mzo publish <id>              draft を公開 (明示・不可逆)
  mzo list                      自分のクイズ一覧 (id<TAB>status<TAB>title の1行/件)
  mzo get <id>                  クイズ1件を JSON で表示 (jq 可・全内容)
  mzo whoami                    PAT の疎通確認 (認証中のユーザを表示)
  mzo help

Env:
  MAZUOBOERU_PAT           必須。Bearer トークン (mzo_pat_...)。Web の設定画面で発行
  MAZUOBOERU_BASE_URL      任意。既定は本番 (https://mazuoboeru.shiraoka.workers.dev)

Input は POST/PATCH /api/quizzes の body そのもの (薄いパイプ・検証はサーバ側):
  {"title": "...", "description": "...",
   "questions": [{"type": "mcq_single", "prompt": "...", "explanation": "...",
                  "choices": [{"text": "...", "isCorrect": true}]},
                 {"type": "short", "prompt": "...", "answer": ["nsproxy"]}]}

update は「望む最終形」を丸ごと送る (mzo get <id> の出力を編集して再送するのが基本):
  設問の "id" あり = その設問を上書き (type は変更不可)
  "id" なし       = 新しい設問を追加
  既存 id を省略  = 公開済みならその設問を引退 (retired・不可逆)、draft なら削除
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
    case "update": {
      const id = rest[0];
      if (!id || id.startsWith("-")) {
        return {
          kind: "usage-error",
          message: "update requires a quiz id: mzo update <id> [file.json]",
        };
      }
      const file = rest[1];
      if (file !== undefined && file.startsWith("-")) {
        return { kind: "usage-error", message: `unknown option: ${file}` };
      }
      return { kind: "update", id, file: file ?? null };
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
