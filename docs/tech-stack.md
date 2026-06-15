# 技術選定

方針: **kokemusu と同じスタックを踏襲**（学習コスト・運用知見を再利用）＋ **関数のみ・`class` なし**
＋ **マルチユーザーの公開 SaaS** に合わせた調整。

## フロントエンド

- **React 19 + Vite + TypeScript**（kokemusu と共通）。
- スタイリング: Tailwind CSS or CSS Modules。
- 状態管理: React 標準 ＋ 必要なら軽量ライブラリ（Zustand 等、関数志向）。
- Markdown 表示: **react-markdown ＋ rehype-sanitize**（生 HTML 非描画。単一コンポーネントに集約し mermaid・数式を保存形式の移行なしで将来差し替え可能に）。UGC を表示するため kokemusu より重要（[security.md](security.md)）。

## バックエンド / API

- **Hono**（軽量・関数志向・`class` 不要）。Cloudflare Workers 上で動かす。
- バリデーション: Zod（型と実行時検証を一致）。
- 認証: **OAuth (Google + GitHub) + PAT (Bearer)**（[ADR-0001](adr/0001-auth-via-oauth-and-pat.md)）。OAuth フローは `arctic`（Lucia 作者の薄いライブラリ。関数志向）だけ採用し、セッション・PAT・middleware は自前実装で関数のみ方針を保つ。Passkey は MVP 範囲外（Phase 2 で Google ログイン後の追加手段として再評価。採用時は `@simplewebauthn/server`）。

## データベース

- **Cloudflare D1**（SQLite 互換）＋ **Drizzle**（関数志向・型安全）。
- マルチユーザーだが、クイズ閲覧・挑戦は **読み取りが主**。D1 で十分に始められる。
- スケール時の検討（必要になってから）: 集計のキャッシュ（Workers KV / Cache API）、人気ランキングの事前集計テーブル、ホットなクエリのインデックス最適化。

## デプロイ方式 ── 案A（Cloudflare Workers + D1）

- **kokemusu の案A を踏襲**。ただし位置づけが異なる:
  - kokemusu = 各自が自分の CF アカウントにデプロイ（per-user セルフホスト）。
  - **mazuoboeru = 開発者が1つの共有サービスとしてデプロイ**（公開 SaaS）。利用者はアカウントを作って使うだけ。
- メリット: 保守最小・無料/低コスト枠・HTTPS 自動・`cloudflare-workers-deploy-skeleton` ほかスキルがそのまま使える。
- **本番ドメイン**: workers.dev 運用を Day 1 で固定（[ADR-0001](adr/0001-auth-via-oauth-and-pat.md)）。実 URL は `mazuoboeru.shiraoka.workers.dev`（account subdomain 由来）、OAuth redirect URI は `https://mazuoboeru.shiraoka.workers.dev/auth/callback/{google,github}`。custom domain への移行は OAuth provider 側に追加 redirect URI を登録するだけで済むため、初期は workers.dev のみで開始。
- 公開サービスゆえ **レート制限・bot 対策**（`cloudflare-workers-bot-scan-defense`）と **D1 バックアップ**（`cloudflare-d1-weekly-backup-via-pr`）の優先度が高い。
- **モデレータ画面**: Phase 4 で導入時、`/admin/*` を Cloudflare Access（Zero Trust 無料枠、50ユーザまで）で IdP ゲートする案を残す。

## コーディング方針

- **`class` を使わない。純粋関数 ＋ モジュール構成**（[[ts-functions-only-no-class]]）。
- ドメインロジック（採点・SRS スケジューリング・集計）は副作用のない純粋関数に寄せ、I/O は境界へ。
  - 特に **採点ロジックは純粋関数 ＋ サーバー実行**（テストしやすく、不正に強い）。
- 型は厳密（`strict`）。Zod スキーマから型を導出。
- テスト: Vitest（採点・SRS など純粋関数を重点）。e2e は `cloudflare-workers-e2e-playwright`。

## ディレクトリ構成（pnpm workspaces）

MVP から **pnpm workspaces** で分割する。パッケージ名は `@mazuoboeru/*` 規約。
**`server/` パッケージは作らない**: `@cloudflare/vite-plugin` が SPA と Worker を1つの Worker にビルドするため、`apps/web` に SPA＋Worker＋`wrangler.jsonc` を同梱するのが正（2026-06-11 確定。[ADR-0003](adr/0003-secrets-strategy.md) の Workers Builds root directory = `apps/web` とも一対一）。Worker 側ロジックの肥大化で分離が必要になったら `packages/` への切り出しを再検討する。

- **Phase 1 のドメイン／DB ロジックは `apps/web/worker/` 内に同居**（2026-06-12 グリル確定）: 採点等の純粋関数は `worker/domain/`、Drizzle スキーマ＆クエリは `worker/db/` に置く。consumer が worker のみのうちは `packages/{core,db}` を立てず、**第2コンシューマ（採点ロジックを必要とする CLI 等）が現れたら同名パッケージへ機械的に切り出す**（前身ディレクトリ名を packages 名に揃えてある）。「関数のみ・I/O は境界へ」は worker 内のディレクトリ境界（`domain/` は I/O を持たない）で担保し、route handler が D1 と純粋関数を繋ぐ。

```
mazuoboeru/
├── apps/
│   ├── web/           # @mazuoboeru/web    : React 19 + Vite SPA ＋ Worker（Hono）同梱
│   │   ├── src/       #   SPA 本体
│   │   ├── worker/    #   API・Cron（Hono on Cloudflare Workers）
│   │   │   ├── domain/ #   採点等のドメイン純粋関数（I/O なし＝packages/core の前身）
│   │   │   └── db/    #   Drizzle スキーマ & クエリ（＝packages/db の前身）
│   │   ├── drizzle/   #   D1 マイグレーション（drizzle-kit 出力）
│   │   └── wrangler.jsonc
│   └── cli/           # @mazuoboeru/cli    : CLI / AI エージェント用（PAT で API を叩く薄い層）※2026-06-15 最小実装（mzo）
├── packages/
│   ├── core/          # @mazuoboeru/core   : 純粋関数（採点・SRS・集計）※ロジック発生時に追加
│   └── db/            # @mazuoboeru/db     : Drizzle スキーマ & クエリ ※ロジック発生時に追加
└── docs/              # 企画ドキュメント・ADR
```

- ビルド orchestration は plain pnpm scripts（`pnpm -r --topological run build` 等）。turborepo は build キャッシュが痛くなるまで導入しない。
- TypeScript は root の `tsconfig.base.json` を各パッケージが extends。`tsc --build`（project references）は使わず、vite/wrangler のバンドラに任せる。
- 境界の強制は ESLint `no-restricted-imports`（例: `apps/web/src`（SPA）から `apps/web/worker` への直接 import 禁止、共有は `packages/core` 経由）。
- `apps/cli` は MVP では npm 未配信。**node24 で `.ts` をネイティブ実行**（ビルド無し＝`node apps/cli/src/index.ts …` / `pnpm --filter @mazuoboeru/cli mzo`、[ADR-0005](adr/0005-node24-native-ts-execution.md)）。Phase 2 で `esbuild` バンドル＋ `npx @mazuoboeru/cli` 配信。
