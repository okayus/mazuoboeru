---
status: accepted
---

# デプロイは Workers Builds でキーレス化、push/PR はホスト側リレー（GitHub App）— サンドボックス内の平文ゼロ

mazuoboeru の自律開発ループ（コンテナ内 Claude が計画→実装→test/lint→PR）を成立させるためのクレデンシャル戦略。2026-06-10 の調査で、Cloudflare API・GitHub git push とも外部ワークロードからの OIDC / workload identity は**非対応**と確認した（前者は Cloudflare が未回答の feature request のまま、後者の OIDC は Actions から外部クラウドへの outbound 専用）。よって「秘密を消す」は認証プロトコルではなく**置き場所の設計**で実現する:

1. **Cloudflare デプロイ**: GitHub Actions からの wrangler デプロイ（GitHub Secrets に `CLOUDFLARE_API_TOKEN`）を廃止し、**Workers Builds**（Cloudflare 側の git 連携 CI/CD）へ移行する。GitHub 側に Cloudflare の秘密はゼロになり、デプロイ資格情報（D1 Edit を追加したカスタムビルドトークン。デフォルトのビルドトークンには D1 が無い点に注意）は Cloudflare 内部に閉じる。GitHub Actions は test/lint の CI だけを担い、**Actions Secrets は空**になる。
2. **git push / PR 作成**: コンテナ内エージェントは `git commit` まで（commit に秘密は不要）。push と PR 作成は**ホスト側リレー**が代行する。認証の根は **GitHub App**（このリポのみにインストール、`contents:write` + `pull_requests:write`）の秘密鍵で、ホストのみが保持しコンテナにはマウントしない。リレーは 1 時間で失効する installation token を都度発行し、`claude/*` ブランチのみを push・PR 化する（main への push・パターン外ブランチ・force push は境界の外で拒否）。リポは bind mount なのでコンテナ内の commit はホストから直接見え、受け渡し工程は不要。App トークンによる push / PR は GITHUB_TOKEN と違い CI を通常どおり起動する。
3. **デプロイのガードレール**: Workers Builds は GitHub CI の結果を待たずに push でビルドするため、「main にあるコード＝CI green 済み」を **main の ruleset**（PR 必須・required status checks・force push 禁止・bypass actor なし）で保証する。D1 マイグレーションは**本番ブランチの deploy command のみ**で実行し、非本番ブランチのビルド（preview）は当面オフ（preview version は本番と同じ D1 binding を共有するため、有効化するとプレビューが本番 DB に触れる）。
4. **アプリ実行時シークレット**（Phase 1 の OAuth client secret ×2・`SESSION_SECRET` 等）: 本番値は人手でホストから **Cloudflare Worker Secrets** に登録（`wrangler secret put`）し、コードと CI は名前参照のみ。開発は **dev 専用 OAuth クライアント**（redirect は localhost のみ）を `.dev.vars`（gitignore 済）に置く 2 層構造。本番シークレットはサンドボックスに決して入れない。dev 層は「漏れても localhost 用クライアントの悪用に留まる」ことを条件に境界内を許容する。
5. **コンテナ内の Cloudflare 認証を廃止**: 現行セットアップ手順のコンテナ内 `wrangler login` は、広権限の OAuth トークンを境界内に置く穴なのでやめる。コンテナの wrangler は**ローカルモード専用**（local D1 / miniflare、認証不要）。アカウント操作（`d1 create`・`secret put`）はホスト側の人手に移す。

理由: 確定済みの優先順位「キーレスで秘密自体を消す ＞ 秘密管理基盤から注入し名前で参照」を、OIDC が両側とも存在しない現実に当てはめると、「長命秘密を外部サービス（GitHub Secrets）に預けず、境界を越えて出回るのは短命トークンかプラットフォーム管理のものだけ」が到達可能な最善形になる。残る長命秘密は **GitHub App 秘密鍵（ホスト保管）** と **Cloudflare 内部のビルドトークン** の 2 つだけで、どちらもサンドボックス境界と GitHub の外にある。ホスト側リレーは Anthropic 自身が文書化する推奨パターン（エージェントに資格情報を見せず、境界外のプロキシ/リレーが認証を注入する）と一致し、sketch.dev・Docker Sandboxes 等 2025–26 の主流実装とも揃う。

## Considered Options

- **SSH agent socket マウント + 専用 deploy key**: 秘密鍵はホストに残り（agent プロトコルに鍵エクスポート操作自体が無い）、OpenSSH 8.9+ の destination-constraint（`ssh-add -h github.com`）で接続先も限定できる。不採用の理由: (a) コンテナが push **能力**を常時保持し、ブランチ方針の強制が GitHub 側のみになる（リレー案は `claude/*` 限定を境界の外でも強制できる）。(b) deploy key は無期限・リポ全体 write・REST API 不可で PR 作成に結局 App か GITHUB_TOKEN が要る。(c) GITHUB_TOKEN が作る PR の CI は手動承認ゲート付き（2026-06 時点の挙動）で無人ループが止まる。リレー不調時の次点として記録。
- **短命 installation token をコンテナに注入**: 1h 失効・最小スコープでも「エージェントに平文を見せない」前提に反する。不採用。
- **GitHub Actions デプロイ継続（最小権限カスタムトークン + TTL/IP 制限）**: Workers Builds に支障（ビルド分超過・モノレポ不適合等）が出た場合のフォールバック。`cloudflare-api-token-permissions` スキル参照。
- **octo-sts 等の OIDC→GitHub トークン交換ブローカ**: ワークロード側に OIDC issuer が必要で、ローカルホストに issuer を自前運用するのは本末転倒。不採用。

## Consequences

- `.github/workflows/deploy.yml` は廃止し、test/lint のみの `ci.yml` に置換。`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` は GitHub に登録しない。
- `.claude/settings.json` の deny は `git push` のみに緩和し、`git commit` をコンテナ内で許可（リレー稼働後に変更）。CLAUDE.md・dev-environment.md の「commit/push はホスト側」規約は「commit はコンテナ内、push/PR はホストリレー」に改訂。
- main への直接 push は ruleset で人間含め全員不可（main に入る経路は PR のみ）。ruleset の強制は public リポなら無料・private は有償プランが必要なため、**リポは public とする**（2026-06-11 合意。本戦略では秘密は一切リポ・Actions に入らないので public が成立する）。
- リポ構成は CLAUDE.md 記載どおり **`apps/web` に Worker 同梱を正**とし（`@cloudflare/vite-plugin` が単一 Worker にビルドする制約と一致）、Workers Builds の root directory = `apps/web` に一対一対応させる。tech-stack.md / roadmap.md の `server/` 分離記述は同梱に揃えて更新する。
- 残る人手（secret-zero、各一度きり）:
  1. GitHub リポ作成・初回 push・main ruleset 設定
  2. GitHub App 作成（`contents:write` + `pull_requests:write`）→ このリポのみにインストール → 秘密鍵をホストへ保管
  3. `wrangler d1 create mazuoboeru-db`（ホスト）→ 実 `database_id` を wrangler.jsonc へ反映
  4. Workers Builds をリポに接続（Cloudflare GitHub App は「選択したリポのみ」）→ root directory / build / deploy command 設定 → **D1 Edit 入りカスタムビルドトークン**を Build 設定に登録
  5. （Phase 1 以降、シークレット追加の都度）`wrangler secret put` と dev 専用 OAuth クライアント作成
  恒常的な人手は PR レビューと merge のみ（これは統治であって秘密運用ではない）。
- 確立した手順は okayus-skills へ還元する（候補: `sandboxed-agent-git-relay`、`cloudflare-workers-builds-keyless-deploy`）。
