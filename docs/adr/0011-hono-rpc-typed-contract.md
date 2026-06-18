# クライアント↔サーバの型契約を Hono RPC で単一真実化

SPA（`apps/web/src`）と Worker（`apps/web/worker`）の間のレスポンス DTO・入力型を、手書きの二重定義から **Hono RPC（`hc<AppType>` ＋ `InferResponseType`）による型導出**へ移行し、契約を「ハンドラ＝単一真実」にする。既存の `request<T>` fetch ラッパと `api.foo()` ファサードは温存して view の呼び出し側は不変に保つ（churn 最小）。（2026-06-18 決定・実装同時。）

## Context

- これまでクライアント（`src/api.ts`）とサーバ（`worker/routes`・`worker/presenters`）は各 DTO（`TimelineItem`・`PublicQuiz`・`AnswerDetail`・`AttemptState`・`Dashboard` 等）を**手書きでミラー**しており、サイレントにドリフトしうる（2026-06-18 コード点検で確認）。presenter（`publicQuizJson` 等）は**戻り型注釈が無く推論**で、フィールド増減がクライアントのコンパイルエラーにならない。
- サーバのエラーは `c.json({ error: "not_found" }, 404)` のように**文字列リテラル**で返り、クライアントは HTTP status だけで分岐し error body を読んでいない＝エラー語彙が型で共有されていない。
- `src` と `worker` は**単一 tsconfig／単一パッケージ**（`apps/web`、`include: ["src/**/*","worker/**/*"]`）に同居し、`import type` で境界越えが可能（型は erase されるのでクライアントにサーバ実装は混入しない）。
- `hono ^4.6` は RPC（`hc` / `InferResponseType`）を提供。型共有の追加依存はゼロ（Hono は既にサーバ）。

## Decision

- 全 router を**メソッドチェーン化**（`new Hono<Env>().post(...).get(...)`）し、`index.ts` で合成した app の型を `export type AppType = typeof routes` として公開する（分離文だと型が route に乗らないため必須）。
- `src/api.ts` は `hc<AppType>` を生成し、レスポンス DTO を **`InferResponseType` でサーバから導出**。手書き DTO の二重定義を撤廃する。
- ただし既存の `request<T>`（同一オリジン fetch＋`ApiError` throw）ラッパと `api.foo()` ファサードは**温存**し、views の呼び出し側（`api.timeline(tag)` 等）は不変に保つ＝churn とリグレッションを最小化（型だけサーバ由来へ差し替える）。
- エラーコードは shared union `ApiErrorCode`（同時導入。`worker/http/errors.ts`）で型付けし、`ApiError.body` をそれに結ぶ。サーバの `c.json` エラー応答も同 union で型チェックする。

## Considered Options

- **現状維持（手書きミラー）**: 単純だが Phase 3 で endpoint が増えるほど二重定義とドリフトが増える。却下。
- **フル `hc` クライアント（views も `client.api.x.$get()` へ全面移行）**: 最も idiomatic でパス安全まで得るが、全 view の呼び出し書き換え＝churn 大・e2e ゴールデンパスの再検証コスト。将来オプションとして見送り。
- **zod レスポンススキーマ共有（実行時検証）**: ランタイム drift 検出まで得るが、zod をクライアントに積む・全レスポンスを schema 化するのが重い。同一オリジン信頼下では過剰。エラー／publish エンベロープに限れば将来検討。
- **Hono RPC で型導出＋既存ファサード温存（採用）**: 「二重定義撤廃」という主目的を最小 churn で達成する。

## Why

- 契約が**ハンドラ＝単一真実**になり、presenter のフィールド変更がクライアントを型で壊す＝ドリフトが構造的に消える。
- Hono は既にサーバ＝**追加依存ゼロ**、単一パッケージ同居で型共有の配線も最小。
- ファサード温存で views 無改変＝e2e のゴールデンパスを温存しリスクを限定。
- Phase 3 の新 endpoint が最初から型共有に乗る（後付けより安い）。

## Consequences

- router を**チェーン化する記法規律**が要る（分離文だと型が乗らない）。新しい route も同様に書く。
- `c.json(x, status)` の **status リテラル規律**（`InferResponseType` は status で型を選ぶ）。成功レスポンスは 200/201 を明示。
- 大きな推論型で `tsc`/tsserver が重くなりうる（route 数 ~30 では許容。重くなれば router 単位で型を分割）。
- ビルド時は型 erase＝**runtime 不変・バンドル不変**（クライアントにサーバコード混入なし。`import type` を厳守）。
- フル `hc` 移行・zod レスポンス検証は**将来オプション**として温存（本 ADR は型導出＋ファサード温存に限定）。
- `presenters/*` と inline `c.json` 応答に**明示戻り型**を与える（推論依存をやめる）。エラーは `ApiErrorCode` union で一元化。
