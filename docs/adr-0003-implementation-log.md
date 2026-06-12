# ADR-0003 実装記録 — Phase A/B/C: 何をして、なぜそうしたか

> 2026-06-10〜12 に「自律開発の最後の穴＝シークレットの扱い」を調査・決定（[ADR-0003](adr/0003-secrets-strategy.md)）し、実働させた記録。
> 決定そのものは ADR、運用手順は [dev-environment.md](dev-environment.md)、再現手順は okayus-skills（`cloudflare-workers-builds-keyless-deploy` / `sandboxed-agent-git-relay`）にあり、本ファイルは「経緯と理由」を残す。

## 出発点（なぜこの作業が必要だったか）

ゴールは「コンテナ内 Claude が **計画→実装→test/lint→PR** を無人で回し、**main には直接触れない**」基盤。当時の障害は 3 つ：

1. コンテナから commit/push が規約で塞がれており、自律で**積み上げられない**。
2. 自律 PR フローに必要な push 資格情報が「**秘密を隔離境界（サンドボックス）に入れない**」原則と衝突する。
3. トークンの発行・登録が人手依存で、どこまで消せる/自動化できるか不明だった。

調査（2026-06-10、Web 一次情報で検証）の結論が方針を決めた：

- **Cloudflare API にも GitHub の git push にも OIDC / workload identity は存在しない**（CF は未回答の feature request、GitHub の OIDC は Actions→外部クラウドの outbound 専用）。
- ゆえに「秘密を消す」は認証プロトコルではなく**置き場所の設計**で実現するしかない：
  **(a)** デプロイ資格情報は Cloudflare 内部に閉じ込める（= Workers Builds）、**(b)** push/PR の長命秘密（GitHub App 鍵）はホストだけが持ち、境界を越えるのは 1 時間で失効するトークンのみ、**(c)** 方針強制（どのブランチを push してよいか）は**境界の外**で行う。

この 3 点と「人手は信頼の根の確立一度きり」を ADR-0003 として記録し、ユーザー合意（2026-06-11: 推奨案 4 点すべて採用 — ホストリレー + GitHub App / Workers Builds / `apps/web` 同梱 / public リポ）のうえで実装した。

## Phase A — ドキュメント整合と CI 差し替え（エージェント、2026-06-11）

**やったこと**: tech-stack / roadmap / README の `server/` 分離記述を `apps/web` 同梱に統一。`deploy.yml`（`CLOUDFLARE_API_TOKEN` で wrangler deploy）を削除し、typecheck+build のみの `ci.yml` に置換（job 名 `ci` = ruleset の required check 名）。dev-environment のセットアップ手順を ADR-0003 仕様に書き換え、**コンテナ内 `wrangler login` を手順から削除**。

**なぜ**:

- 構造不一致（設計ドキュメント=分離 vs 実体=同梱）は Workers Builds の root directory 設定と一対一になる「正」を先に決めないと、以降の設定作業が揺れるため**最初に**揃えた。同梱が正なのは `@cloudflare/vite-plugin` が SPA+Worker を 1 Worker にビルドするという技術制約に合うから。
- CI から deploy を消すのは ADR の核心（GitHub Secrets を空にする）の前提作業。
- `wrangler login` 廃止は調査中に見つけた**ブリーフ未記載の穴**：広権限の OAuth トークンがコンテナ内に残る。ローカル開発は認証不要のローカルモード（local D1 / miniflare）で足りるので、消せる秘密だった。

## Phase B — secret-zero セレモニー（人手一度きり、2026-06-11）

**やったこと**（人手＝トークン・鍵の発行を伴うもの。CLI で代行できる部分はエージェントが実行）:

1. ホストで `wrangler login` → `wrangler d1 create mazuoboeru-db` → 実 `database_id` を wrangler.jsonc へ（**初回 push 前**＝skeleton ルール）。
2. public リポ作成・初回 push（39 ファイル。push 前に staged 内容の資格情報パターン走査を実施）。
3. main に ruleset 適用: PR 必須・required check `ci`（**GitHub Actions 発行に限定** `integration_id: 15368`）・force push/削除禁止・**bypass actor なし**（オーナーも main 直 push 不可）。
4. GitHub App `mazuoboeru-relay` 作成（権限は `contents:write` + `pull_requests:write` のみ・Webhook 無効・このリポのみにインストール）。秘密鍵はホストの `~/.config/mazuoboeru-relay/`（700/600、コンテナ非マウント）へ。JWT 署名テストで鍵↔App の対応と installation を検証。
5. Workers Builds 接続（CF の GitHub App は「選択リポのみ」）: root directory `apps/web`、build = `pnpm install --frozen-lockfile && pnpm run build`、deploy = `d1 migrations apply --remote && wrangler deploy`、**D1 Edit を足したカスタムビルドトークン**を Build 設定で選択、**非本番ブランチビルド（preview）は無効**。

**なぜ**:

- **public リポ**: ruleset の強制が無料で効く（private は有償）。本戦略では秘密が一切リポに入らないので公開が成立する。
- **ruleset が deploy のガード**: Workers Builds は GitHub CI の green を**待たない**。「main にあるコード＝CI green 済み」を merge 時点で構造的に保証することで、CI を待たない deploy が安全になる。
- **D1 Edit 入りカスタムトークン**: デフォルトのビルドトークンには D1 権限が無く、deploy command 内のマイグレーションが（既知バグで**静かに**）失敗するため。トークンは Cloudflare 内部に留まり、GitHub にもホストにも置かない。
- **preview 無効**: Workers の preview version は**本番と同じ D1 binding を共有**する（version 用に D1 を分ける公式手段なし）。PR プレビューが本番データに触れる事故を構造的に防ぐ。
- **App の最小権限・Webhook 無効**: リレーが必要なのは push と PR 作成だけ。検知はローカル（bind mount の .git）で済むので Webhook も要らない＝受信エンドポイントという攻撃面を作らない。

**つまずきと発見**（再現時の注意。スキルにも収録）:

- 初回ビルド失敗の原因は **Root directory がセットアップ画面の「詳細設定」アコーディオンに隠れていた**こと（未設定だとリポルートで実行され必ず失敗）。
- **App ID と Installation ID の取り違え**（インストール URL の数字は installation id）。`GET /apps/<slug>` はプライベート App だと 404、`/user/installations` は App ユーザートークン専用なので、**JWT を作って `GET /app` + `GET /app/installations`** が唯一確実な検証法。
- **`mazuoboeru.workers.dev` というホスト名は構造上存在しない**（workers.dev は常に `<worker名>.<accountサブドメイン>` の 2 階層）。実 URL は当時 `mazuoboeru.toshiaki-mukai-9981.workers.dev`。account subdomain 改名は全 Worker の URL に波及するため「他サービスへの影響確認後・**Phase 1 の OAuth 登録前**」として持ち越した（→ **2026-06-12 に `shiraoka` へ改名済み**。現 URL は `mazuoboeru.shiraoka.workers.dev`、旧 URL は失効）。

## Phase C — ホスト側リレーと無人 E2E（エージェント、2026-06-11〜12）

**やったこと**:

1. リレー `relay.mjs`（Node・依存ゼロ・関数のみ）を **リポ外** `~/.config/mazuoboeru-relay/` に設置。60 秒間隔の systemd user timer で起動。動作: `refs/heads/claude/*` を走査 → `origin/main` と差分があるブランチだけ → App の 1h installation token を発行（repo と権限をさらに絞って down-scope）→ exact refspec で push → PR を冪等に作成。**拒否**: `claude/*` 外・force push（diverge 検知）・main。
2. 無人 E2E（PR #1）: コンテナ内で `claude/phase-b-docs` に commit → リレーが push・PR 化 → CI green（承認ゲートなし）→ **人間が merge** → Workers Builds が自動デプロイ（merge commit の check run と deployments で確認）。
3. 最終化（PR #2）: `.claude/settings.json` の deny を `git push` のみに緩和（`add/commit/checkout/switch` を許可）、CLAUDE.md の git 規約を最終形に、運用手順を dev-environment に記載。この commit は**リレーを手で起動せず timer が拾った**＝完全無人経路の実証。
4. 確立手順を okayus-skills に還元（`cloudflare-workers-builds-keyless-deploy` / `sandboxed-agent-git-relay`）。

**なぜ**:

- **リレーをリポ外に置く**: リポはサンドボックスから書き換え可能（bind mount）。方針強制コードが被統制側から編集できたら強制にならない。鍵と同じ「境界の外」に置く。
- **GitHub App が deploy key / PAT / GITHUB_TOKEN に勝る理由**: 1 時間で失効・リポと権限で二重に絞れる・PR 作成もできる・push/PR が CI を通常起動する。対して GITHUB_TOKEN 製 PR の CI は手動承認ゲート付き（2026-06 時点）で無人ループが止まり、deploy key は無期限&PR 不可、PAT は失効管理という人手を恒常化させる。
- **「origin/main と差分があるときだけ」**: 空ブランチの空 PR を防ぎ、squash merge 後に残る古いローカルブランチが**空 PR として蘇生するのを防ぐ**（three-dot diff 判定）。
- **credential helper を一度空にリセットしてから注入**: ホストに `gh` のグローバル helper があると、リレーの push が**ユーザー本人の資格情報で**実行されてしまう（App の bot 識別・最小権限が無意味になる）ため。トークンは env 経由で渡し argv にもディスクにも出さない。
- **systemd timer に `AccuracySec=10s`**: デフォルト精度 1 分の coalescing で 60 秒間隔が実質 2 分になるため。

## 到達した状態（検証済みの不変条件）

| 場所 | 置かれている秘密 |
| --- | --- |
| サンドボックス（コンテナ） | **ゼロ**（Claude 自身の認証のみ。push 能力も無し） |
| GitHub（Actions Secrets / リポ） | **ゼロ** |
| ホスト `~/.config/mazuoboeru-relay/` | GitHub App 秘密鍵（長命秘密 その1） |
| Cloudflare 内部 | D1 Edit 入りビルドトークン（長命秘密 その2） |
| 境界を越えて移動するもの | 1 時間で失効する installation token のみ |

- main に入る経路は「PR + CI green + 人間の merge」だけ（オーナー含め直 push 不可）。merge は統治であって秘密運用ではない＝**恒常的な人手はレビューのみ**。
- コンテナ内 Claude は `claude/*` に commit するだけで、push・PR・デプロイまで全自動で届く（PR #1・#2 で実証）。
- 失敗時の可観測性: `journalctl --user -u mazuoboeru-relay.service`（push/PR/拒否が 1 行ずつ）、GitHub の check run（`ci` と `Workers Builds: mazuoboeru`）。
