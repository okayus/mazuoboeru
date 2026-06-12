# まず覚える (mazuoboeru) — プロジェクト指示

> 学んだことをクイズ化して反復で覚える学習 Web アプリ。**クイズは必ず公開**され、
> **全ユーザーが他人のクイズに挑戦できる**＝マルチユーザーの公開サービス。

このファイルは、コンテナ内も含めどの Claude セッションでも最初に読む前提の要約。
詳細は `docs/`（このファイルは目次＋働き方の規約）。

## まず読むドキュメント

- `README.md` — 概要と目次
- `CONTEXT.md` — 用語集（`/grill-with-docs` 由来。混同を避けたい語彙の正典）
- `docs/adr/` — 根幹判断の ADR（後戻りしにくい決定の理由つき記録）
- `docs/concept.md` — 名前の由来（まず覚える）・「必ず公開」の思想
- `docs/features.md` — 機能（クイズ作成・挑戦・採点・復習SRS・発見）
- `docs/security.md` — セキュリティ（**最重要**：マルチユーザー・UGC のサニタイズ・モデレーション）
- `docs/tech-stack.md` / `docs/data-model.md` — 技術選定とデータモデル
- `docs/dev-environment.md` — 開発環境・Cloudflare認証・デプロイ骨格
- `docs/roadmap.md` — フェーズと「決めること」

## このプロジェクトの本質（kokemusu との違いを忘れない）

- **マルチユーザーの公開サービス**。1つの共有サービスを大勢が使う（kokemusu の「各自セルフホスト・完全プライベート」とは対極）。
- **クイズは必ず公開**（非公開オプションを作らない）。これは意図的な設計制約（理由は `docs/concept.md`、ADR 候補）。
- **他人のコンテンツ（UGC）を表示する** → XSS サニタイズ・モデレーションが中心課題。
- 公開なのはクイズ本体。**個人の学習履歴・成績・メールアドレスは非公開**。

## 確定済み / 既定の決定（2026-06-08 グリル後）

- **デプロイ: 案A = Cloudflare Workers + D1**（kokemusu を踏襲。ただし**単一の共有デプロイ**＝SaaS であって per-user セルフホストではない）。
- **フロント = React 19 + Vite + TS / API = Hono / DB = D1 + Drizzle**。
- 開発はサンドボックス（Docker + egress ファイアウォール）内。ホスト側 dev ポートは **5373**（5173/5273 は他プロジェクトと衝突）。
- **認証**: Web は OAuth (Google + GitHub)、CLI/AI エージェントは PAT (Bearer)。`arctic` + 自前 middleware。Passkey は MVP 範囲外（Phase 2 候補）。同一 verified email は自動リンク。詳細: `docs/adr/0001-auth-via-oauth-and-pat.md`。
- **本番ドメイン**: workers.dev 運用（Day 1 固定方針）。**実 URL は `mazuoboeru.toshiaki-mukai-9981.workers.dev`**（account subdomain 由来。2026-06-11 初デプロイで確定。設計時表記の `mazuoboeru.workers.dev` は存在しない点に注意）。account subdomain を変えるなら Phase 1 の OAuth redirect URI 登録・RP_ID/ORIGIN 固定の**前**に。custom domain への移行は redirect URI 追加で後付け可。
- **「必ず公開」**: 状態は `draft` / `published` / `hidden` の3値、`private` なし。`draft` → `published` は明示・不可逆。公開後の編集は軽微は自由・重大は UI 警告、削除はソフト。詳細: `docs/adr/0002-publish-flow-and-edit-rules.md`。
- **設問形式 MVP**: `mcq_single` + `mcq_multi`（strict 採点）のみ。`boolean` / `short` / `cloze` は Phase 2 候補。
- **モデレーション MVP**: 通報チャネル（ボタン + endpoint + テーブル + rate limit）のみ。Discord 通知・admin UI は Phase 2〜4。
- **リポ構成**: pnpm workspaces（globs: `apps/*` `packages/*`）、パッケージ名 `@mazuoboeru/*`。
  - **歩く骨格では `apps/web`（`@mazuoboeru/web`）に SPA＋Worker＋wrangler.jsonc を同梱**（`@cloudflare/vite-plugin` が web と worker を1つの Worker にビルドするため）。設計初期に想定した独立 `server/` は apps/web/worker に内包＝**当面 `server/` パッケージは作らない**（要なら後で分離検討。2026-06-11 確定、設計ドキュメント側も同梱に統一済み）。`apps/cli`・`packages/{core,db}` はロジック発生時に追加（skeleton 方針）。
  - node: サンドボックスは node20。CI(ci.yml) は node22。engines は `>=20`。完全一致が要るなら sandbox を node:22 に上げる（任意）。pnpm はコンテナ再作成のたび `npm i -g pnpm@9.15.0`（corepack enable は /usr/local/bin 権限不足で不可）。
- **Claude Code ツールセット**（2026-06-08 整備）:
  - `.claude/settings.json`（プロジェクト共有）: pnpm / wrangler dev / wrangler d1 / git の読み取り系 / gh の読み取り系 / 一部 WebFetch を allowlist。`git push` のみ deny（push/PR はホスト側リレーが代行＝ADR-0003。2026-06-11 のリレー稼働に伴い `git add`/`commit`/`checkout`/`switch` を許可へ緩和済み）。**`gh` が実際に動くのはホストのみ**（コンテナ内は未認証で大半のコマンドが拒否される。GH_TOKEN を入れるのは secret-zero に反するので不可＝2026-06-12 確認）。
  - `.mcp.json`（プロジェクト共有）: Cloudflare 公式 MCP は **`cloudflare-docs` の1つだけ**（認証不要・ドキュメント検索）。bindings/builds/observability は wrangler と機能が被り、認証(OAuth)の callback がコンテナで不安定なので**入れない**（2026-06-08 に docs-only へ trim）。アカウント操作は wrangler（settings で許可済み）で行う。
  - サンドボックス firewall に `developers.cloudflare.com` と `docs.mcp.cloudflare.com` を追加（`.docker/init-firewall.sh`）。**反映には `docker compose down && docker compose build && docker compose up -d`（プロジェクトディレクトリで、`-f` を付けず＝override 自動ロード）が必要**。
  - `init-firewall.sh` の canonical 差分は「dig リトライ」「`ipset -exist`」の2点のみ。
- **シークレット戦略（2026-06-11、ADR-0003）**: デプロイは **Workers Builds**（キーレス。GitHub Secrets に CF トークンを置かない。D1 Edit 入りカスタムビルドトークンを CF 側 Build 設定に登録）。push/PR は**ホスト側リレー + GitHub App**（コンテナは commit まで、`claude/*` ブランチのみ）。リポは **public**・main は ruleset 保護（PR 必須 + required check = `ci`）。本番アプリ秘密は Cloudflare Worker Secrets（コードは名前参照のみ）、dev は dev 専用 OAuth クライアントを `.dev.vars`。**コンテナ内 `wrangler login` はしない**（ローカルモード専用）。詳細: `docs/adr/0003-secrets-strategy.md`。
- **未決定（持ち越し）**: 短答採点の正規化方針（Phase 2 で `short` 追加時に再開）、custom domain の購入と移行タイミング、account subdomain（`toshiaki-mukai-9981`）の改名（2026-06-11 判断: **やる方向だが、同アカウントで他サービス稼働中のため影響確認してから**。変更は全 Worker の URL に波及。**期限: Phase 1 の OAuth 登録・ORIGIN 固定の前**。なお `mazuoboeru.workers.dev` のような subdomain なし URL は構造上不可＝docs 確認済み、きれいな URL の正解は custom domain）。

## 働き方の規約（重要）

- **TypeScript は関数のみで書く。`class` を使わない。** ドメインロジックは純粋関数、I/O は境界へ。
- **デプロイ基盤を先に通してからロジックを載せる**（「歩く骨格」: `main` push → 本番 `/health` 200 ＆ SPA 表示）。
- **git: コンテナ内は `claude/*` ブランチへの commit まで、push/PR はホスト側リレーが自動代行**（GitHub App・systemd timer 60秒間隔。ADR-0003）。`claude/*` 外・force push はリレーが拒否、main は ruleset でも保護（PR + CI green のみ）。`git push` はコンテナで deny。リレー本体はリポ外 `~/.config/mazuoboeru-relay/`（サンドボックスから改変不能）、ログは `journalctl --user -u mazuoboeru-relay.service`。
  - コンテナ内から PR・CI の状態を見るには **未認証 REST を `curl -s https://api.github.com/...` で叩く**（public リポなので読み取りは認証不要・60 req/h で足りる。例: `repos/okayus/mazuoboeru/commits/<branch>/check-runs`）。`gh` は未認証では動かないので使わない。この curl 形式は allowlist 済み、宛先の強制は egress firewall が担う。
- 採点・正誤判定は**必ずサーバー側**で（クライアントに正解を渡してから採点しない＝カンニング/不正防止）。
- 他ユーザーのクイズ表示は**サニタイズ必須**（DOMPurify 等）。Markdown を許すなら生 HTML は禁止。
- Claude Code 自体の機能・設定で不明な点は https://code.claude.com/docs/llms.txt を WebFetch して確認する。

## 参照スキル（okayus-skills）

Cloudflare 関連手順は `okayus-skills` のスキルに集約（リポジトリ外。コンテナには override マウントで `~/.claude/skills:ro` として見える）。

- `claude-code-docker-sandbox` — 開発サンドボックス（構築済み）
- `cloudflare-workers-deploy-skeleton` — SPA+API+Cron の歩く骨格（生成済み。デプロイ経路は ADR-0003 で Workers Builds に変更）
- `cloudflare-api-token-permissions` — CI デプロイ用トークンの最小権限（ADR-0003 後はフォールバック専用）
- `cloudflare-d1-drizzle-migration` — D1 で drizzle-kit を安全に（実スキーマ投入時に必読）
- `cloudflare-workers-e2e-playwright` — e2e（認証含む）
- `cloudflare-workers-bot-scan-defense` — 認証/投稿 route のレート制限（**公開サービスなので重要**）
- `cloudflare-d1-weekly-backup-via-pr` — D1 週次バックアップ
- `cloudflare-workers-builds-keyless-deploy` — Workers Builds キーレスデプロイ（本プロジェクトの ADR-0003 で確立し還元）
- `sandboxed-agent-git-relay` — サンドボックス agent の push/PR ホストリレー（同上）

## 次のアクション

1. ~~okayus-skills 確認＆再ビルド、firewall 反映~~ → **完了**（2026-06-08）。
2. ~~MCP の認証~~ → **完了/確定**（`cloudflare-docs` のみ・認証不要・✓ Connected）。
3. ~~シークレット戦略の調査・決定・ドキュメント整合~~ → **完了**（2026-06-11、`docs/adr/0003-secrets-strategy.md`。deploy.yml → ci.yml 化済み）。
4. ~~Phase B（人手セレモニー）~~ → **完了**（2026-06-11）: リポ https://github.com/okayus/mazuoboeru（public・main ruleset 保護・CI green）／ D1 `mazuoboeru-db` 作成・`database_id` 反映済み／ GitHub App `mazuoboeru-relay`（App ID 4024233、鍵と設定はホストの `~/.config/mazuoboeru-relay/`）／ Workers Builds 接続済み（root `apps/web`・D1 Edit 入りカスタムトークン）→ **本番 `/health` 200**。
5. ~~Phase C（エージェント）~~ → **完了**（2026-06-11）: ホスト側リレー `mazuoboeru-relay` 稼働（systemd user timer 60秒・`~/.config/mazuoboeru-relay/`）。無人 E2E 実証済み（コンテナ内 commit → 自動 push → PR #1 → CI green → 人間が merge → Workers Builds デプロイ）。deny 緩和・規約最終化・okayus-skills 還元済み。
6. **Phase 1 着手**（`docs/roadmap.md` の最初の縦切り: Google ログイン → クイズ作成 → 公開 → 別アカウントで挑戦 → サーバー採点）。**着手前に account subdomain を確定**（未決定欄参照。OAuth redirect URI と ORIGIN が依存）。

作る前の考慮事項の整理には `/grill-with-docs` を使い、用語を `CONTEXT.md`・後戻りしにくい決定を `docs/adr/` に落とす。
