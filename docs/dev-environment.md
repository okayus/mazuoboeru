# 開発環境・デプロイ基盤

kokemusu と同じ構成（`okayus-skills` のスキル群）を踏襲。差分はポートとコンテナ名のみ。
ここでは mazuoboeru 固有の状態と、公開サービスゆえに優先度が上がる点を記す。

## 使うスキルとフェーズ対応

| スキル | 用途 | mazuoboeru での使いどころ |
| --- | --- | --- |
| `claude-code-docker-sandbox` | egress ファイアウォール付き開発コンテナ | **構築済み**（ホスト 5373） |
| `cloudflare-workers-deploy-skeleton` | SPA+API+Cron を1 Worker・D1・GH Actions | **Phase 0** 骨格構築 |
| `cloudflare-api-token-permissions` | CI デプロイ用トークンの最小権限 | フォールバック専用（デプロイは Workers Builds に移行、[ADR-0003](adr/0003-secrets-strategy.md)） |
| `cloudflare-d1-drizzle-migration` | D1 で drizzle-kit を安全に | **Phase 1** 実スキーマ投入時（必読） |
| `cloudflare-workers-bot-scan-defense` | 認証/投稿 route のレート制限・bot 耐性 | **公開サービスなので優先度高**（Phase 1〜） |
| `cloudflare-workers-e2e-playwright` | Workers+Vite+Hono の e2e（認証含む） | **Phase 1** |
| `cloudflare-d1-weekly-backup-via-pr` | D1 週次バックアップ | **Phase 4**（公開データなので早めでも可） |
| `cloudflare-cron-to-discord` | Cron→Discord 通知 | 任意（通報アラート等に使えるかも） |

## 現在の状態（2026-06-06 構築済み）

- 配置: `.docker/Dockerfile` / `.docker/init-firewall.sh`（kokemusu から流用。egress 許可は npm/anthropic/cloudflare）／ `docker-compose.yml` / `docker-compose.override.yml`。
- **ポート**: ホスト `5373`（5173=汎用Vite, 5273=kokemusu と衝突回避）。コンテナ内 Vite は 5173、ブラウザからは `http://localhost:5373`。
- コンテナ名 `mazuoboeru-dev`。
- **CLAUDE.md / docs / .claude/skills/grill-with-docs** を配置済み（コンテナ内 Claude が自動ロード／プロジェクトスキルとして認識）。
- スキル: `docker-compose.override.yml`（gitignore）で `okayus-skills` を `~/.claude/skills:ro` に読み取り専用マウント。
- **検証済み**: `example.com`→`000`（遮断）/ `registry.npmjs.org`→`200`、実行ユーザ `node`、`/workspace` bind mount、`CLAUDE.md` 自動ロード、`grill-with-docs`（project scope）＋ `okayus-skills` 9件（user scope）がコンテナから認識。
- **`.docker/init-firewall.sh` をスキル版から改変**: ドメイン解決の `dig` に **リトライ（最大5回）** を追加。複数サンドボックス同時起動時に embedded DNS が一過性タイムアウトし、1回失敗で `exit 1`→コンテナ停止する問題への対策。canonical スクリプトとの差分は retry・`ipset -exist`・optional ドメイン（statsig、解決失敗は非致命。2026-06-12）の3点（詳細は CLAUDE.md）。
  （※ kokemusu の同スクリプトには未適用。同じ flakiness を踏むなら同様の改変を backport 推奨。）

## Cloudflare の認証（2系統）

### (a) デプロイ認証 — Workers Builds でキーレス（[ADR-0003](adr/0003-secrets-strategy.md)）
- 本番デプロイ: **Workers Builds**（Cloudflare 側の git 連携 CI/CD）。GitHub 側に Cloudflare の秘密はゼロ（**Actions Secrets は空**、GitHub Actions は test/lint の `ci.yml` のみ）。
  - ビルドトークンは Cloudflare 内部。**デフォルトには D1 Edit が無い**ため、D1 Edit を追加したカスタムトークンを Build 設定に登録する（人手・一度きり）。
  - D1 マイグレーションは**本番ブランチの deploy command のみ**で実行。非本番ブランチビルド（preview）は当面オフ（preview version は本番 D1 binding を共有するため）。
  - Workers Builds は GitHub CI の green を待たない → main の ruleset（PR 必須 + required check = `ci`）で「main＝green 済み」を保証する。
- コンテナ内 wrangler は**ローカルモード専用**（local D1 / miniflare、認証不要）。**`wrangler login` はコンテナでしない**（広権限トークンを境界に入れない）。
- アカウント操作（`d1 create`・`secret put` 等）はホスト側の人手で行う。
- フォールバック（Workers Builds に支障が出た場合のみ）: GitHub Actions + 最小権限 Custom Token（`cloudflare-api-token-permissions` スキル。⚠️「Edit Cloudflare Workers」テンプレは D1 欠落 → Create Custom Token）。

### (b) アプリのユーザー認証（マルチユーザー）── 要決定
- OAuth〔Google 等〕／パスキー(WebAuthn)／併用。詳細は [security.md](security.md) / [ADR-0001](adr/0001-auth-via-oauth-and-pat.md)。
- パスキー採用時は **RP_ID = `<project>.workers.dev` を初回デプロイで固定**（後で変えると登録済みパスキー無効）。

## セットアップ順（Phase 0）

1. **コンテナ起動済み前提**: `docker compose up -d`（初回 build 済み）。実装作業はコンテナ内（`claude` 認証のみコンテナ内で）。
2. ~~skeleton テンプレ生成・ローカル dev 確認~~ → **完了**（`apps/web` に SPA＋Worker＋wrangler.jsonc 同梱）。
3. **ユーザー操作（ホスト）**: `wrangler d1 create mazuoboeru-db` → 実 `database_id` を `apps/web/wrangler.jsonc` へ反映（**初回 push 前に必須**＝skeleton ルール）。
4. **ユーザー操作**: GitHub に **public** リポ作成 → 初回 commit & push → main の ruleset（PR 必須・required check = `ci`・force push 禁止・bypass actor なし）。
5. **ユーザー操作**: GitHub App 作成（`contents:write` + `pull_requests:write`、このリポのみインストール）→ 秘密鍵をホストに保管（コンテナにマウントしない）。
6. **ユーザー操作**: Cloudflare ダッシュボードで Workers Builds を接続（GitHub App は「選択したリポのみ」）→ root directory `apps/web`・build/deploy command 設定 → D1 Edit 入りカスタムビルドトークン登録 → 非本番ブランチビルドはオフ。
7. ~~エージェント: ホスト側リレー構築 → 無人 E2E~~ → **完了**（2026-06-11。PR #1 で実証: コンテナ内 commit → リレー自動 push → PR → CI green → merge → Workers Builds デプロイ）。RP_ID/ORIGIN の本番固定は Phase 1 の OAuth 登録時（account subdomain 確定後）。

## 日常運用

- 起動: **`./up.sh`**（= `op run --env-file=.docker/sandbox.env -- docker compose up -d`。1Password のアンロックが 1 回入る）／ シェル: `docker compose exec dev zsh` ／ 停止: `docker compose stop`（env は保持）／ `docker compose down` のあとは必ず `./up.sh`（plain `docker compose up -d` だと token 無しで起動＝push できない。fail closed）。
- git 運用（[ADR-0003](adr/0003-secrets-strategy.md) 2026-08-22 追記）: **コンテナ内で `claude/<topic>` に commit → `git push -u origin claude/<topic>` → `gh pr create --fill` まで agent が行う**。コンテナの env にだけ **mazuoboeru 1 リポ限定の fine-grained PAT**（Contents + Pull requests、Workflows なし、90 日）が入り、git は env を読む inline credential helper、`gh` は `GH_TOKEN` を直接読む（compose の `command` が毎起動で設定。ディスクには書かない）。
  - token の唯一の保管場所は 1Password（item `github-pat-mazuoboeru-sandbox`）。`.docker/sandbox.env`（gitignore）は `op://` 参照だけを持つ。90 日ごとに GitHub で Regenerate → `op item edit` → `./up.sh`。
  - 境界は main の ruleset（PR + `ci` + bypass なし）と token scope。`.claude/settings.json` の deny（force push / `main` / ブランチ削除 / `gh pr merge` / `gh auth` / `gh api`）は慣習の担保（コンテナの bypass モードでは deny だけが効く）。
  - **merge は人間がホストで行う**。`Relay-Merge: yes` トレーラーは廃止。agent 発意の merge が要るなら `gh pr merge --auto --squash` のみを allow に切り替える（CI green の強制は ruleset）。
  - 旧リレー（`mazuoboeru-relay.timer`・`~/.config/mazuoboeru-relay/`・GitHub App）は停止済みで戻し道として 1 か月保持: `systemctl --user enable --now mazuoboeru-relay.timer` で復帰（その場合は `.claude/settings.json` の deny を `git push` 一括に戻す）。
  - 手順の正典は okayus-skills `sandboxed-agent-github-token-via-1password`（本リポが最初の適用）。
- `.docker/*` や `docker-compose.yml` を変えたら `docker compose down && build && up -d`。`down -v` は認証も消える。

## CLI（`@mazuoboeru/cli`）の npm リリース — ホスト手動（[ADR-0015](adr/0015-cli-npm-distribution.md)）

npm の資格情報は**ホストにしか置かない**（サンドボックス/CI に置かない＝[ADR-0003](adr/0003-secrets-strategy.md) の secret-zero を npm にも適用）。publish は低頻度のホスト手動運用。

### 初回セレモニー（一度だけ・人手）

1. npmjs.com にログインし **org `mazuoboeru` を作成**（無料・public パッケージ用）。scope は package.json の `name`（`@mazuoboeru/cli`）と一致必須＝org 名が取られていたら publish 前に要再相談。
2. ホストで `npm login`（web方式。ブラウザでログイン承認するまでターミナルはポーリング待機＝Ctrl+Cで打ち切らない）。
3. **アカウントの2FAを `auth-and-writes` で有効化**（`npm profile enable-2fa auth-and-writes` または npmjs.com の Account settings。認証アプリでQRスキャン→リカバリーコード保存）。**必須**: npmの現行ポリシー上、2FA未設定だと publish 時に `npm error code E403` になる（2026-08-13 実機確認）。`auth-only` では要求を満たさないので `auth-and-writes` を選ぶこと。

### 毎回のリリース手順

1. `apps/cli/package.json` の `version` bump を含む PR を merge（bump は通常の PR フロー＝コンテナ内エージェントも可。git タグは打たない）。
2. ホストで:

   ```sh
   git switch main && git pull
   cd apps/cli
   pnpm publish
   ```

   - ⚠️ **`pnpm -C apps/cli publish`（root から `-C` 経由）は使わない**: pnpm 9.15.0 で委譲先 `npm publish` の argv に `-C` の値が余分な位置引数として混入し `npm error code EUSAGE` になる不具合を実機確認済み（2026-08-13）。**必ず `cd apps/cli` してから `pnpm publish`** を実行する。
   - `prepublishOnly`（tsc → lint → test → `vp pack`）が全ゲートを自動実行＝publish される dist は常に検査済み・ビルド直後（`mzo --version` の焼き込みもここで一致する）。
   - pnpm の git チェック（clean tree・main 上）も効く。
   - **同一 version の再 publish は registry が拒否**＝「publish が落ちる＝bump し忘れ」のシグナル（事前チェック儀式は不要）。
   - **アカウントの2FAが `auth-and-writes` で有効でないと `npm error code E403` になる**（npmの現行ポリシー。2026-08-13 実機確認）。未設定なら `npm profile enable-2fa auth-and-writes` で有効化してから再実行。有効なら publish 時にOTP入力を求められる。

3. 反映確認（コンテナ内からでも可・registry.npmjs.org は egress allowlist 済み）:

   ```sh
   npm view @mazuoboeru/cli version
   pnpm dlx @mazuoboeru/cli --version
   ```

- provenance は付かない（npm Trusted Publishing/OIDC へ移行すれば付く。再開条件は ADR-0015）。
