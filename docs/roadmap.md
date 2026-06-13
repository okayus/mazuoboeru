# ロードマップ

「動くものを早く」→「共有プールが回る」→「定着（SRS）」→「安全・健全に保つ」の順。

## Phase 0 — スキャフォールド（土台）

> 詳細は [dev-environment.md](dev-environment.md)。

- **開発環境コンテナ**構築済み（`claude-code-docker-sandbox`、ホストポート 5373）。
- **pnpm workspaces** で `apps/web`（SPA＋Worker＋wrangler.jsonc 同梱）を生成済み。`apps/cli`・`packages/{core,db}` はロジック発生時に追加（[tech-stack.md](tech-stack.md)）。
- デプロイ骨格（`cloudflare-workers-deploy-skeleton`）で「歩く骨格」を本番デプロイまで通す。本番ドメインは workers.dev 運用で固定、実 URL は `mazuoboeru.shiraoka.workers.dev`（[ADR-0001](adr/0001-auth-via-oauth-and-pat.md)）。
- Cloudflare 認証: デプロイは **Workers Builds**（キーレス、[ADR-0003](adr/0003-secrets-strategy.md)）。コンテナ内 wrangler はローカルモード専用（`wrangler login` しない）。アカウント操作はホスト側の人手。
- DB スキーマとマイグレーション（[data-model.md](data-model.md)）。`api_token` テーブルを最初から含める。実スキーマ投入は `cloudflare-d1-drizzle-migration` 必読。
- 認証の骨組み: `arctic` + 自前 Hono middleware（Google/GitHub の OAuth クライアント登録 → redirect URI `https://mazuoboeru.shiraoka.workers.dev/auth/callback/{google,github}`）。
- ドメインロジックの器（`packages/core`：採点・SRS）。

## Phase 1 — MVP（共有が成立する最小形）

ゴール: **アカウントを作り、クイズを作って明示公開でき、他人のクイズに挑戦して採点される。AI エージェントが PAT でクイズを量産できる。**

- アカウント / 認証: OAuth (Google + GitHub)、同一 verified email 自動リンク（[ADR-0001](adr/0001-auth-via-oauth-and-pat.md)）。
- **PAT 発行・管理 UI**（設定画面）と Bearer middleware。CLI / Claude が API でクイズを作成・更新できる。
- クイズ作成 CRUD（`mcq_single` + `mcq_multi` ＋解説）。`draft` → 「公開する」ボタンで `published`（不可逆、[ADR-0002](adr/0002-publish-flow-and-edit-rules.md)）。
- 公開タイムライン（新着）、クイズ詳細。クエリは常に `status='published' AND deleted_at IS NULL`。
- 挑戦 ＆ **サーバー側採点**（純粋関数 in `packages/core`）、即時フィードバック（正誤＋解説）。
- 通報チャネル（クイズ/設問/ユーザ単位、選択肢理由＋自由記述、レート制限 10件/日/ユーザ）。
- UGC 描画は react-markdown ＋ rehype-sanitize（生 HTML 非描画、[ADR-0004](adr/0004-ugc-markdown-rendering.md)）/ CSP（`img-src 'self'`）/ 認証・投稿のレート制限（`cloudflare-workers-bot-scan-defense`）。
- `apps/cli` の最小実装（PAT を env から読んで `POST /quiz` を叩く薄い Node スクリプト、npm 未配信）。

## Phase 2 — 発見と振り返り

- 検索・タグ・カテゴリ、人気/ランキング、作者ページ。
- 学習ダッシュボード（本人の正答率・履歴・ストリーク）。
- お気に入り、追加設問形式: **`boolean`（○×）→ `short`（短答、正規化方針詰め）→ `cloze`（穴埋め）** の順。
- Passkey 追加（Google ログイン後の追加手段。`@simplewebauthn/server`）。
- 通報の **Discord/メール通知**（`cloudflare-cron-to-discord` スキル）。
- CLI の npm 配信（`esbuild` バンドル → `npx @mazuoboeru/cli`）。

## Phase 3 — 定着（SRS）

- 間隔反復の復習キュー（`review_state`）、自己評価で間隔調整。
- 「今日の復習」、タグ別習熟度。

## Phase 4 — 健全な運営・拡張

- モデレーション管理画面（`/admin/*` を **Cloudflare Access** で IdP ゲート、無料枠50ユーザ）、自動スパム検知、監査ログ。
- D1 バックアップ運用（`cloudflare-d1-weekly-backup-via-pr`）、集計のキャッシュ/事前集計。
- ハード削除＋データエクスポート/アカウント削除（プロバイダ責任制限法・GDPR 対応）、コメント（モデレーション前提）、PWA。
- 編集履歴 (`quiz_revision`)、`attempt` への `quiz_title_snapshot` で履歴の自立性確保。

---

## 決定済み（2026-06-08 グリル、以降追記）

| # | 項目 | 結論 | 参照 |
| --- | --- | --- | --- |
| 1 | ユーザー認証方式 | OAuth (Google + GitHub) + PAT、Passkey は Phase 2 候補 | [ADR-0001](adr/0001-auth-via-oauth-and-pat.md) |
| 1' | 同一 email マージ | 自動リンク（verified 前提） | ADR-0001 |
| 1'' | CLI / AI 認証 | PAT (Bearer)、Phase 1 から | ADR-0001 |
| 1''' | OAuth ライブラリ | `arctic` + 自前 middleware | [tech-stack.md](tech-stack.md) |
| 2 | 本番ドメイン | workers.dev 運用を Day 1 固定（実 URL `mazuoboeru.shiraoka.workers.dev`） | ADR-0001 |
| 3 | 設問形式 MVP | `mcq_single` + `mcq_multi` のみ、strict 採点 | [features.md](features.md), [data-model.md](data-model.md) |
| 4 | 「必ず公開」 | `draft` → `published` 不可逆、軽微編集可、削除はソフト、`hidden` はモデレータ専用 | [ADR-0002](adr/0002-publish-flow-and-edit-rules.md) |
| 6 | モデレーション MVP | 通報チャネル + rate limit のみ（admin UI は Phase 4） | features.md / data-model.md |
| 7 | リポ構成 | pnpm workspaces、`apps/web` に SPA＋Worker 同梱（`server/` は作らない）、`apps/cli`・`packages/{core,db}` は必要時 | tech-stack.md |
| 8 | シークレット戦略（2026-06-11） | Workers Builds キーレスデプロイ + ホスト側リレー push/PR。サンドボックス内平文ゼロ、リポ public・main は ruleset 保護 | [ADR-0003](adr/0003-secrets-strategy.md) |
| 9 | セッション / CSRF（2026-06-12 グリル） | 30日スライディング・DB は sha256 ハッシュ保存・host-only Cookie（本番 `__Host-`）・SameSite=Lax + 状態変更の Origin 検証 | ADR-0001, [security.md](security.md) |
| 10 | 自動リンク厳密化（同上） | リンク/作成は「いまのプロバイダが検証済みメールを主張」時のみ、未検証は拒否 | ADR-0001 |
| 11 | 提出単位 / 再開（同上） | 1問ずつ即時採点（[[Immediate Feedback]]）、未完了 Attempt は続きから再開、集計は完了 Attempt のみ | [CONTEXT.md](../CONTEXT.md) |
| 12 | 公開ゲート（同上） | publish 時にサーバが採点可能性を強制（タイトル/設問≥1/選択肢≥2/正解数、strict 採点） | [ADR-0002](adr/0002-publish-flow-and-edit-rules.md) |
| 13 | UGC 描画（同上） | react-markdown + rehype-sanitize（生 HTML 非描画）、単一 renderer で拡張可、画像/mermaid は Phase 2 | [ADR-0004](adr/0004-ugc-markdown-rendering.md) |
| 14 | ドメイン配置 / PAT（同上） | 採点等は `worker/domain`・スキーマは `worker/db` に同居（packages は第2 consumer まで保留）、PAT は `mzo_pat_` 形式・既定無期限 | [tech-stack.md](tech-stack.md), [data-model.md](data-model.md) |

## 持ち越し（Phase 2 以降で再開）

- **採点の厳密さ**: `short`（短答）追加時に正規化方針（大小・全半角・表記ゆれ・別解）を詰める。
- **custom domain**: ローンチ後、サービス定着の手応えに合わせて購入・移行。OAuth redirect URI は workers.dev と custom を併存させて段階移行。
- **CLI の npm 配信**: Phase 2 で `esbuild` バンドル + `npx @mazuoboeru/cli`。
- **Passkey 追加導線**: Google ログイン後の「パスキーを登録」フロー（Phase 2）。
- **admin UI / 自動アクション**: Phase 4（モデレータ画面、Cloudflare Access で `/admin/*` ゲート、`N 件通報で自動 hidden` 等）。

## 次のアクション

- [x] 主要な「決めること」を `/grill-with-docs` で詰めた（[CONTEXT.md](../CONTEXT.md) / [docs/adr/](adr/)）。
- [ ] Phase 0：pnpm workspaces 骨格生成 → `cloudflare-workers-deploy-skeleton` で「歩く骨格」を本番 `/health` 200 まで通す。
- [ ] 最初の縦切り: 「Google ログイン → クイズ作成（`mcq_single`） → 明示公開 → 別アカウントで挑戦 → サーバー採点 → 即時フィードバック」を一本通す。
- [ ] PAT 発行 UI + Bearer middleware を最初の縦切りに同梱（Claude で動作検証）。
