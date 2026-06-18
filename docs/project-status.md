# プロジェクト現況（mazuoboeru）

> **このファイルは「いまどこにいて、ここから何が要るか」を共有する“生きたステータス”。**
> 新セッションは `CLAUDE.md` の次にこれを読む。古い手順書ではなく現況なので、
> **鵜呑みにせず §「現況の確かめ方」で実機確認してから動く**こと（ドキュメントは遅れる、本番は嘘をつかない）。
> - 長期のフェーズ計画 → このファイル末尾 §「ロードマップ（フェーズ計画）」（旧 `roadmap.md` を統合）
> - 後戻りしにくい決定の理由 → [docs/adr/](adr/)（正典）
> - 用語の正典 → [CONTEXT.md](../CONTEXT.md) / 働き方の規約 → [CLAUDE.md](../CLAUDE.md)
>
> **最終更新: 2026-06-18**（更新したら日付と §「いま動いているもの」を直す）

---

## 30秒で把握

- **何**: 学んだことをクイズ化して反復で覚える **公開 SaaS**。マルチユーザーで、**クイズは必ず公開**され誰でも他人のクイズに挑戦できる。中心課題は UGC の安全表示（XSS サニタイズ）・モデレーション・サーバー側採点（カンニング防止）。
- **基盤**: Cloudflare Workers + D1 / React 19 + Vite / Hono / Drizzle。**TS は関数のみ（class 禁止）**。デプロイは Workers Builds（キーレス）、push/PR/merge はホスト側リレー。**node は host/sandbox/CI とも node24**（ADR-0005。`apps/cli` の `.ts` はビルド無しネイティブ実行）。
- **いま**: **Phase 1 の最初の縦切り（ログイン→作成→公開→挑戦→サーバー採点）は実装され main にマージ・本番デプロイ済み**。バックエンドは PAT で一周動作する。
- **Phase 2「発見と振り返り」実装・本番反映済み（2026-06-17・実機確認）**: タグ＋上位下位タクソノミ（広いタグ検索で下位も一致・ドリルチップ）／学習ダッシュボード（全体・実効タグ別正答率・ストリーク）／Favorite「my hot」／挑戦フロー再設計（1画面1問・設問別の本人正答率）。PR #44–#48・各 Workers Builds success（migration 0003–0005 自動適用を確認）。設計は [ADR-0006](adr/0006-dashboard-aggregation-semantics.md)/[ADR-0007](adr/0007-tag-subsumption-taxonomy.md)。残: 人気/ランキング・作者ページ・追加設問形式・Passkey・通報の Discord 通知・CLI npm 配信。
- **ログイン開通**: **GitHub ログインが本番・dev とも開通**（2026-06-14）。MVP は **GitHub のみ**（Google は可逆保留＝ADR-0001）。Phase 1 縦切りはブラウザで端から端まで動作する。
- **直近の前進**（2026-06-15〜16）: **B1 通報チャネルを merge・本番稼働**（#32。`0002_report.sql` は **Workers Builds が自動適用**＝人手 migrate 不要、`report` テーブル実在を確認）。**D1 マイグレーションは自動適用**という事実を正典化（#35。旧「人手で当てる」は誤りだった＝§ハマりどころ）。**コミット時に本番状態の断定を検証する verify-prod-claims フックを追加**（#36、§開発の進め方）。**B3 cli を merge・本番デプロイ・本番実証**（#38。`apps/cli`＝PAT でクイズ作成/公開する薄い CLI `mzo`。あわせて **host/sandbox/CI を node24 に統一し `.ts` をビルド無しネイティブ実行**＝ADR-0005。本番で実 PAT による create→作者 API で内容一致→非公開確認→ソフト削除まで実機確認）。**A4 e2e は完了・本番反映済み**（**PR #39 merge＝main `012cfaf`・Workers Builds デプロイ success**。コンテナ内 `pnpm e2e` 6/6 緑。本番コードに認証バイパスを足さず session seam＋ビルド成果物を `wrangler dev` で駆動。`.docker/Dockerfile` の `INSTALL_PLAYWRIGHT=true` で Chromium をビルド時に焼き込み＝コンテナ完結／runtime egress ゼロ。**この e2e が挑戦ビューの本番バグ＝React #310 hooks 違反を検出・修正**＝本番バンドルも修正後 `index-91zgNzP4.js` に更新済み）。**ドッグフーディング作成者ゲート（allowlist）を実装・merge・本番デプロイ・本番でゲート ON 実証**（#41＝main `394b06a`。`ALLOWED_CREATORS` secret 投入済み＝列挙メールのアカウントのみ作成/公開可。作者のブラウザ作成成功を確認＝自己ロックアウト無し）。**残りの Phase 1 は投稿 per-user レート制限のみ**（一般公開前で足り、当面は allowlist で代替）。
- **次の実装の設計確定（2026-06-18 grill）**: Phase 3「定着」を **Review List（設問単位の手動復習プール＝旧 favorite 置換）＋ドリル**として設計確定（SM-2 在庫スケジューラは持たない・再出題の間隔は将来の通知へ／[ADR-0008](adr/0008-review-list-manual-pool.md)・[ADR-0006](adr/0006-dashboard-aggregation-semantics.md) 追記・[CONTEXT.md](../CONTEXT.md) の Review List/Drill）。**実装は別セッション**（本セッションは設計＋ドキュメントのみ）。**着手前にリンターとして Vite+ を導入する**（ツール選定は確定、セットアップは実装セッションで）。
- **本番**: https://mazuoboeru.shiraoka.workers.dev

---

## いま本番で動いているもの（2026-06-16 実機確認）

| 項目 | 状態 | 確認したこと |
| --- | --- | --- |
| `/health`・SPA 配信 | ✅ | `{"status":"ok"}` / SPA HTML（正タイトル）を配信 |
| **本番 D1 マイグレーション適用** | ✅ **適用済み** | `/api/public/quizzes` が 500 ではなく `{"quizzes":[]}` を返す＝テーブル実在 |
| 公開タイムライン / 挑戦 API | ✅ | `/api/public/quizzes(/:id)` が JSON 応答（答え非開示の射影） |
| 認証セッション API | ✅ | `/api/auth/me` が `{"user":null}`（未認証） |
| 認可ガード | ✅ | `GET /api/quizzes/mine`→401、`POST /api/tokens`→403（CSRF Origin 検証が発火） |
| セキュリティヘッダ | ✅ | strict CSP（`default-src 'self'` ベース）・HSTS・`X-Content-Type-Options:nosniff`・`X-Frame-Options:DENY` が本番で付与 |
| **本番 OAuth ログイン（MVP=GitHub のみ）** | ✅ **開通** | `/auth/github` → `github.com/login/oauth/authorize`（client_id/redirect_uri/scope 確認）。prod・dev ともブラウザ実ログイン確認済み。Google は MVP では出さない（ADR-0001） |
| **レート制限 / observability（B2）** | ✅ **デプロイ済み** | #28 merge＋Workers Builds success。`AUTH_RATE_LIMITER`(30/60s)・observability 100% を OAuth begin/callback に。CLI 検証は v3 偽陰性／挙動バーストは不確定＝**稼働確定は Dashboard**（§ハマりどころ） |
| **通報チャネル（B1）** | ✅ **稼働（migration も自動適用済み）** | #32 merge＋Workers Builds success。`POST /api/reports` は Origin 無し→403 / 未ログイン→401（結線確認）。**本番 D1 に `report` テーブル実在を確認**（host `wrangler d1 execute --remote "SELECT name FROM sqlite_master ... name='report'"` → report）。**migration は Workers Builds が自動適用**（deploy command = `d1 migrations apply --remote && wrangler deploy`）＝人手不要 |
| **PAT 経由のクイズ作成（量産導線・B3）** | ✅ **本番実証** | `mzo create` が本番 D1 に draft 生成→作者 API で round-trip 一致（status=draft）→public GET 404（非公開）→soft-delete 動作（#38・実 PAT）。CSRF は Bearer exempt で PAT は Origin 不要 |
| **作成者ゲート（allowlist・ドッグフーディング）** | ✅ **稼働（ゲート ON）** | #41 merge＋Workers Builds success（main `394b06a`）。`ALLOWED_CREATORS` secret 投入済み→**作者がブラウザでクイズ作成成功**（許可側は通る）。非許可は `403 not_allowed_creator`（観測には第2アカウント要）。`wrangler secret delete ALLOWED_CREATORS` で開放に戻せる。一般公開時は外して投稿 per-user レート制限へ |
| **タグ＋タクソノミ（#44/#45・Phase 2）** | ✅ **稼働（タグ付与＋初エッジ投入済み）** | 公開3クイズにタグ（Docker ／ Docker,security ／ HTTP,Protocol,Web）。**最初の上位下位エッジ `HTTP ⊂ Protocol` をホスト側 wrangler で投入・実機確認**: `?tag=Protocol`→related.narrower=['HTTP']、`?tag=HTTP`→related.broader=['Protocol']（ドリルチップ動作）。エッジは運用者 curate（DB/CLI）。WB success＝0003/0004 適用（[ADR-0007](adr/0007-tag-subsumption-taxonomy.md)） |
| **学習ダッシュボード（#46・Phase 2）** | ✅ **稼働** | `GET /api/dashboard`（session 限定・未認証 **401** 実機確認）。全体／実効タグ別正答率＋ストリーク。私的・per-answer・活動量（[ADR-0006](adr/0006-dashboard-aggregation-semantics.md)） |
| **Favorite / my hot（#47・Phase 2）** | ✅ **稼働** | `GET /api/favorites` **401**・`POST` は Origin 無し **403**（実機確認）。Workers Builds success＝0005 favorite 適用済み |
| **挑戦フロー再設計（#48・Phase 2）** | ✅ **稼働** | 1画面1問＋設問別の本人正答率（私的）。**e2e 6/6 緑**で再設計 golden-path をコンテナ内 Chromium 実機通過 |

> つまり **データ層・公開読み取り・採点・セキュリティ境界・ログイン入口まで本番で生きている**。Phase 1 縦切りは人間がブラウザで端から端まで使える状態。**Phase 2（発見と振り返り）の主要機能も本番で稼働**（タグ検索・ダッシュボード・my hot・1画面1問の挑戦）。

### main にマージ済みの実装（Phase 1 縦切り）
9 テーブル（user / oauth_account / session / api_token / quiz / question / choice / attempt / attempt_answer）＋ `drizzle/0001_phase1_slice.sql`（CHECK/FK/索引）。セッション（30 日スライディング・sha256 保存・host-only Cookie）／OAuth（arctic、検証済みメール限定 auto-link）／CSRF(Origin)＋セキュリティヘッダ／PAT（`mzo_pat_`・既定無期限・session 限定発行）／クイズ author CRUD＋公開ゲート（採点可能性をサーバ強制）／公開タイムライン＋挑戦ビュー／strict 採点（純粋関数、vitest 15 件）／react-markdown + rehype-sanitize の SPA（バンドル分割・SWR・memo 済み）。

---

## ここから必要なもの（きっちりした手順ではなく「何が要るか」）

### A. Phase 1 を「人が実際に使える」状態にする — ✅ ほぼ完了（2026-06-14）

> **MVP は GitHub ログインのみ**（Google は可逆保留＝ADR-0001。動機: Google の console 作業が複数プロジェクトでスケールしない／無料プロジェクト数の上限）。Google を後で足すのは redirect URI 追加＋secret 投入で無痛。

1. ~~**GitHub OAuth App 作成**~~ → ✅ 完了（prod 用1個・dev 用1個。OAuth App は callback 1個のみ＝**環境ごとに別 App** が要る）。
2. ~~**本番 Worker Secrets 投入**（`pnpm secrets:prod`＝`apps/web/scripts/put-prod-secrets.sh`、ADR-0003）~~ → ✅ 完了。`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`/`PAT_PEPPER` 投入、`/auth/github` 開通確認。
3. ~~**dev 用 GitHub OAuth App ＋ `.dev.vars`**~~ → ✅ 完了。`pnpm dev --host`（host 5373）でローカル一周確認（ローカル D1 はシード入り・自動 migrate）。
4. ~~**Playwright e2e** で一周を自動化~~ → ✅ **完了・本番反映済み（PR #39 merge＝main `012cfaf`・Workers Builds success。再ビルド後コンテナ内 `pnpm e2e` で 6/6 緑）**。**この e2e が本番バグを検出**: 挑戦ビュー `Challenge.tsx` が `useCallback` を early return の後に置いており（React #310）attempt ロード時にページごとクラッシュしていた＝サーバ/PAT テストでは踏めない React 描画経路。hook 順序を修正（commit b55e35d）。✅ **#39 デプロイで本番も解消済み**（本番バンドルが修正後 `index-91zgNzP4.js` に更新＝Vite 内容ハッシュで確認。先に公開したテストクイズも挑戦可能に）。`apps/web/e2e/` に 3 spec＝計6テスト（golden path＝作者が作成→公開→**別アカウントで挑戦→サーバ採点** ／ authz 境界＝他者 draft は 404・未認証 401 ／ security headers が全レスポンスに付与）。**本番コードに認証バイパスを足さない**のが要点: login は GitHub OAuth（callback の server→github.com 往復はヘッドレス不可。dev OAuth App の鍵は“アプリ”資格で、github.com 上のユーザー認証＝ヘッドレス自動化不可は別問題）なので、テスト側で D1 に `session` 行を seed（`id=sha256(token)` を `worker/auth/session.ts` と同一スキームで算出）しブラウザに cookie 注入＝**本番 `getSessionUser` を実通過**（DEV_BYPASS を足さない＝スキル準拠。理由は `apps/web/e2e/README.md`）。`wrangler dev` でビルド成果物を駆動（vite dev を避け CSP×HMR 罠回避）＋`--persist-to`（D1 state 罠回避）。**コンテナ完結化**: `.docker/Dockerfile` の `INSTALL_PLAYWRIGHT=true` で **Chromium をビルド時に焼き込む**（build 時はネット開放＝runtime allowlist 変更不要。e2e は外部 egress ゼロ）。`@playwright/test` と `PLAYWRIGHT_VERSION` を同一固定（現 1.60.0）＝バージョン更新時は両方上げて**再ビルド**（runtime は CDN 遮断で自己回復不可）。コンテナ Chromium は `--no-sandbox`（DEVCONTAINER gate）。検証: イメージ再ビルド後、**コンテナ内 `pnpm e2e` で 6/6 緑**（焼き込み chromium-1223・`--no-sandbox`）。`pnpm check:e2e` も緑。非コンテナ host なら `playwright install chromium`→`pnpm e2e`。罠: e2e worker は `--ip 127.0.0.1`（`localhost` 経路は sandbox の IPv4/IPv6 解決で worker 無応答）。スキル `cloudflare-workers-e2e-playwright`。

> `RP_ID` / `ORIGIN` は wrangler.jsonc が本番値、`.dev.vars` が localhost 上書き。dev は host 経由 5373 に合わせ `ORIGIN=http://localhost:5373` と dev App の callback を一致させる。

### B. Phase 1 スコープでまだ無い機能（縦切りに含めなかった分）

- ~~通報チャネル~~ → ✅ **実装・merge・本番デプロイ済み（#32）**。`report` テーブル（target_type=quiz/question/user・reason_category 5種・自由記述≤500字・status open/actioned/dismissed）＋ `POST /api/reports`（**session 限定＝PAT 不可**・対象存在検証・同一(reporter,target)は冪等・**レート制限 10件/rolling 24h/ユーザ**は DB count で実装＝unsafe ratelimit binding は 10/60s 粒度しか無く日次に使えないため）＋ 挑戦画面のクイズ通報ボタン。ローカル D1 で一周検証済み（201 / 重複 200 / 自己通報 400 / 不在 404 / 不正 400 / 超過 429）。triage は当面 `wrangler d1 execute` で SELECT（admin UI は Phase 4）。**本番 D1 へ `0002_report.sql` は Workers Builds が #32 デプロイ時に自動適用済み**（`report` テーブル実在を host `wrangler d1 execute --remote` で確認。migration は手で当てない＝§ハマりどころ「D1 マイグレーションは自動適用」）。残タスクなし。
- ~~認証ルートのレート制限（B2）~~ → ✅ **完了・デプロイ済み**（#28 merge＋Workers Builds success）。observability(100%) ＋ unsafe ratelimit binding `AUTH_RATE_LIMITER`(30/60s)・fail-open を OAuth begin/callback に（wrangler 3.x は top-level `ratelimits` 非対応＝unsafe 形式）。スキル `cloudflare-workers-bot-scan-defense`。**稼働の確定は Dashboard**（CLI は v3 偽陰性＝§ハマりどころ）。投稿の per-user 制限は別途（**一般公開前で足りる**。当面は次項の allowlist で代替）。
- **ドッグフーディング作成者ゲート（allowlist）** → ✅ **merge(#41)・本番デプロイ・ゲート ON 実証（2026-06-16）**。`ALLOWED_CREATORS` env（カンマ/空白区切りメール）で `POST /api/quizzes`・`POST /api/quizzes/:id/publish` を絞る `requireCreator` ミドルウェア（純粋関数 `worker/domain/creator-allowlist.ts` ＋ vitest 7件・境界は middleware）。**空/未設定＝ゲート OFF＝従来どおり誰でも作成可**（deploy しても誰もロックしない）／非空＝列挙メール以外は 403・メール無しは fail-closed。キーは **OAuth 検証済みメール（ADR-0001）＝別 GitHub アカウントでのなりすまし不可**。これは「自分だけで UX を磨く」期間の**暫定ゲート**で、投稿 per-user レート制限の代替ではない（一般公開時に外し、通報ルートの DB count パターンで per-user 制限へ移行）。**`ALLOWED_CREATORS` secret は本番投入済み（2026-06-16）＝ゲート ON**。作者のブラウザ作成成功で自己ロックアウト無しを確認。開放に戻すなら host で `wrangler secret delete ALLOWED_CREATORS`（dev は `.dev.vars`）。
- ~~`apps/cli` の最小実装~~ → ✅ **merge・本番デプロイ・本番実証済み（#38・2026-06-15）**。`@mazuoboeru/cli`（`mzo`）: `create`（draft 作成・id を stdout）／`publish <id>`（明示・不可逆）の2コマンド。入力は `POST /api/quizzes` の body そのもの（薄いパイプ＝検証はサーバ zod 一手）。env `MAZUOBOERU_PAT`／`MAZUOBOERU_BASE_URL`（既定=本番）。出力契約: stdout=データ・stderr=診断・exit `0/1/2`。**node24 で `.ts` をビルド無しネイティブ実行**（host/sandbox/CI を node24 に統一＝[ADR-0005](adr/0005-node24-native-ts-execution.md)。CSRF は Bearer を exempt＝`security.ts` 確認済みなので PAT 経路は Origin 不要）。純粋関数（argv/リクエスト構築/応答→exit 写像）を vitest 26件・境界は fetch 注入。型・test・サンドボックス内 help/exit 検証済み。本番煙テスト: 実 PAT で `create`→作者 API で round-trip 一致（status=draft）→public GET 404（非公開）→ソフト削除まで実機確認。残タスクなし。

### C. その先（Phase 2 以降の入口）

検索・タグ、学習ダッシュボード、追加設問形式（`boolean`→`short`→`cloze`）、Passkey、通報の Discord/メール通知、復習（Review List・Phase 3）、モデレーション管理画面（Phase 4）。詳細と順序は下記 §「ロードマップ（フェーズ計画）」。

> **実スキーマ変更時は必ず** スキル `cloudflare-d1-drizzle-migration` を読む（constraint 変更/table rebuild は FK OFF のカスケード削除トラップ＋要バックアップ。列追加は安全）。

---

## ロードマップ（フェーズ計画）

> 旧 `docs/roadmap.md` を統合（2026-06-16）。**near-term の残作業は §「ここから必要なもの」**、**確定済みの既定は [CLAUDE.md](../CLAUDE.md) §確定済み**、**後戻りしにくい決定の理由は [docs/adr/](adr/)** が正典。ここはフェーズの順序と長期の見取り図に徹する。方針: 「動くものを早く」→「共有プールが回る」→「定着（復習）」→「安全・健全に保つ」。

### Phase 0 — スキャフォールド ✅ 完了
開発コンテナ（host 5373）／pnpm workspaces（`apps/web` に SPA＋Worker＋wrangler.jsonc 同梱）／歩く骨格を本番 `/health` 200 まで／Workers Builds キーレスデプロイ／D1 スキーマ＋マイグレーション。詳細 [dev-environment.md](dev-environment.md)・[ADR-0003](adr/0003-secrets-strategy.md)。

### Phase 1 — MVP（共有が成立する最小形）✅ ほぼ完了
ゴール: アカウント作成 → クイズ作成（`mcq_single`/`mcq_multi`）→ 明示公開（不可逆）→ 他人が挑戦 → サーバー採点。AI エージェントが PAT で量産。
- ✅ 済み: GitHub OAuth（Google は可逆保留＝[ADR-0001](adr/0001-auth-via-oauth-and-pat.md)）／PAT 発行・Bearer middleware／作成 CRUD ＋解説／不可逆 publish ＋公開ゲート／公開タイムライン・挑戦／サーバー strict 採点／UGC sanitize（react-markdown + rehype-sanitize＝[ADR-0004](adr/0004-ugc-markdown-rendering.md)）／通報チャネル（#32）／認証ルートのレート制限（#28）／`apps/cli`（`mzo`・#38）／Playwright e2e（#39）。
- ⏳ 残り: **投稿の per-user レート制限のみ**（§B。一般公開前で足りる）。当面の単一ユーザ運用は**作成者 allowlist ゲート**（`ALLOWED_CREATORS`・§B）で代替（#41・本番 ON 済み）。

### Phase 2 — 発見と振り返り
- ✅ **タグ＋上位下位タクソノミ（#44/#45・本番）**: タグ付け・タグ絞り込み（広いタグで下位も一致）・ドリルチップ。`tag`/`quiz_tags`/`tag_edge` 実装。**3クイズにタグ付与済み・最初のエッジ `HTTP ⊂ Protocol` 投入済み**（related を実機確認）。**残: 人気/ランキング・作者ページ**。
- ✅ **学習ダッシュボード（#46・本番）**: 全体・実効タグ別正答率・ストリーク（私的・per-answer＝[ADR-0006](adr/0006-dashboard-aggregation-semantics.md)）。
- ✅ **お気に入り／挑戦フロー再設計（#47/#48・本番）**: Favorite「my hot」＋ 1画面1問・設問別の本人正答率。
- 追加設問形式 **`boolean` → `short` → `cloze`** の順（`short` で正規化方針＋`question.answer` 列が要る）。
- Passkey 追加導線（**`credential` 未実装**、`@simplewebauthn/server`）。
- 通報の Discord/メール通知（スキル `cloudflare-cron-to-discord`）。
- CLI の npm 配信（`esbuild` バンドル → `npx @mazuoboeru/cli`）。

### Phase 3 — 定着（復習 / Review List）
**設計を更新（2026-06-18 grill・[ADR-0008](adr/0008-review-list-manual-pool.md)）**: アルゴリズム的 SRS（SM-2・`review_state`・「今日の復習」due キュー）は**作らない**。代わりに **Review List**（UI "my hot list"・**設問単位**の手動プール・旧 favorite を置換）＋**ドリル**（1問ずつ再回答＋即時フィードバック・「覚えた＝外す／まだ＝残す」）。ドリル回答（`review_answer`）はストリーク・活動量に算入（[ADR-0006](adr/0006-dashboard-aggregation-semantics.md) 追記）。**再出題の間隔（スペーシング）は将来の通知機能へ後ろ倒し**。新テーブル `review_list`(user_id, question_id) / `review_answer`。タグ別習熟度は後続。**実装は別セッション**（本セッションは設計＋ドキュメントのみ）。**着手前にリンターとして Vite+ を導入**。

### Phase 4 — 健全な運営・拡張
モデレーション管理画面（`/admin/*` を **Cloudflare Access** で IdP ゲート）／自動スパム検知・監査ログ／D1 週次バックアップ（スキル `cloudflare-d1-weekly-backup-via-pr`）／集計のキャッシュ・事前集計（`quiz_stats`）／ハード削除＋データエクスポート・アカウント削除（GDPR）／編集履歴 `quiz_revision`＋`attempt.quiz_title_snapshot` で履歴の自立性確保／コメント（モデレーション前提）・PWA。

### 持ち越し（再開条件つき）
- **短答採点の正規化**（大小・全半角・表記ゆれ・別解）— Phase 2 で `short` 追加時に詰める。
- **custom domain** の購入・移行 — ローンチ後。redirect URI を workers.dev と custom で併存させ段階移行（subdomain なし URL は構造上不可＝custom domain が正解）。
- **CLI の npm 配信** — Phase 2（`esbuild` → `npx`）。
- **admin UI / 自動アクション**（N 件通報で自動 hidden 等）— Phase 4。

---

## 現況の確かめ方（コピペ・コンテナ内から可）

```bash
# 本番が生きているか
curl -s https://mazuoboeru.shiraoka.workers.dev/health                 # → {"status":"ok"}

# 本番 D1 にテーブルがあるか（JSON が返れば適用済み / 500 なら未適用）
curl -s https://mazuoboeru.shiraoka.workers.dev/api/public/quizzes      # → {"quizzes":[...]}

# 本番 OAuth が開通したか（MVP=GitHub。Location を見る）
curl -s -o /dev/null -D - https://mazuoboeru.shiraoka.workers.dev/auth/github | grep -i location
#   github.com…                      → 設定済み（開通）
#   /?auth_error=provider_unconfigured → secret 未投入（未開通）

# 本番のセキュリティヘッダ
curl -s -o /dev/null -D - https://mazuoboeru.shiraoka.workers.dev/ | grep -iE 'content-security-policy|strict-transport'

# 通報ルートが本番で結線しているか（認証前で弾く＝credential なしで確認可）
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://mazuoboeru.shiraoka.workers.dev/api/reports \
  -H 'Content-Type: application/json' -d '{}'   # → 403（CSRF Origin。Origin 付き未ログインなら 401）

# PR / CI の状態（public リポなので未認証 REST で読める。gh は未認証では使わない）
curl -s https://api.github.com/repos/okayus/mazuoboeru/commits/main/check-runs
```

---

## 開発の進め方（要点・詳細は CLAUDE.md / ADR-0003）

- **コンテナ内は `claude/*` ブランチへ commit まで**。`git push` は deny、push/PR/merge は **ホスト側リレー**（systemd timer 60 秒）が自動代行。merge を任せるなら **HEAD commit 末尾に `Relay-Merge: yes`**（迷う/影響大は付けず人間 merge）。
- **規約**: TS は関数のみ class なし／採点・正誤判定は必ずサーバー側／UGC は react-markdown + rehype-sanitize（生 HTML 非描画）／公開クエリは常に `status='published' AND deleted_at IS NULL`／秘密はコードに書かず名前参照。
- 本番デプロイは **main マージ → Workers Builds が自動ビルド**（GitHub CI の green は ruleset が強制）。
- **コミット時に本番状態の断定を検証するフック**（#36、`.claude/hooks/verify-prod-claims.sh`・`.claude/settings.json` の `PreToolUse`）: `git commit` 直前に発火し、(a) D1 migration 変更 (b) 本番 migration/secret/binding 状態の断定キーワードを検知すると「本番で検証してから書け」を **system-reminder で注入**（inject-only・fail-open＝ブロックはしない）。**この reminder が出たら断定の前に検証する**（migration は §ハマりどころの自動適用、green な Workers Builds=適用済み）。stale doc を本番状態として伝播した事故の決定論的な再発防止＝自動メモリ `verify-prod-state-not-stale-docs`。初回有効化時に Claude Code が信頼確認を出す。キーワードは inject-only なので調整自由。

---

## ハマりどころ / 注意

- **Relay-Merge 空再 merge ループ**: 過去に PR #15〜#22 が同一ツリーの空コミットを量産した（`claude/*` ローカルブランチを消さないと毎 tick 再 merge される）。merge 後はブランチ削除を確認。詳細は自動メモリ `relay-merge-loop-gotcha`。
- **D1 マイグレーションは自動適用（手で当てない）**: Workers Builds の **deploy command が `wrangler d1 migrations apply mazuoboeru-db --remote && wrangler deploy`**（dashboard 設定・D1 Edit 入りカスタムトークン）。だから **main にマージしたマイグレーションは本番へ自動適用**され、`pnpm db:migrate:prod` を人手で叩く必要はない（スキル `cloudflare-workers-builds-keyless-deploy`）。**コンテナから credential なしで適用確認できる**: 当該 main コミットの `Workers Builds: mazuoboeru` check が **success**＝migrate→deploy が両方走った証拠（migrate が先）。失敗モードは「未適用」ではなく「**ビルドが赤い**」＝多くは build token の D1 Edit 欠落（v3 で silent failure）。⚠️ preview/非 prod ブランチビルドは OFF のまま（preview は **prod の D1 を共有**＝preview の migrate が本番を触る）。〔2026-06-15 修正: 旧記述「本番 D1 マイグレーション忘れ＝人手適用」は誤りだった。実機（`SELECT ... sqlite_master`）と矛盾、green な Workers Builds が真実。自動メモリ `verify-prod-state-not-stale-docs`〕
- **`gh` はコンテナ内では未認証で動かない**（ホスト専用）。PR/CI 状態は上記の未認証 `curl` で読む。
- **`wrangler versions view` は unsafe ratelimit / observability を表示しない（v3）**: wrangler 3.x の `versions view` 出力はバインド一覧に `DB`(D1)・vars・secrets しか出さず、`unsafe` 形式の ratelimit binding（`AUTH_RATE_LIMITER`）と `observability` ブロックを**描画しない**。B2（PR #28）の検証で `versions view` が空に見えても、それは未デプロイではなく CLI が出さないだけ。デプロイ済みアカウント状態の確定は**ダッシュボードが正典**（Workers & Pages → mazuoboeru → Settings → Bindings に `AUTH_RATE_LIMITER`、Observability は Observability タブ）。スキル `cloudflare-workers-bot-scan-defense` にも還元済み。
- **デプロイ検証はコンテナから credential なしで完結できる**: 「設定が本番に乗ったか」は (1) `wrangler.jsonc` ＋消費コード（`worker/middleware/rate-limit.ts`）を読み、`curl https://api.github.com/repos/okayus/mazuoboeru/commits/main/check-runs` で `Workers Builds: mazuoboeru` の success を確認（source+pipeline の真実）、(2) 挙動テスト（`/auth/github` を 60 秒に 30 回超叩いて **429** を確認。middleware は fail-open なので、429 が返れば binding は生きている証明。出ない場合は eventual consistency でも起こるため不確定）で足りる。Cloudflare の credential が要る読み取り（`versions view`・observability の有効/無効）はホスト/ダッシュボードに残す＝**意図どおりの境界**（egress 自体は `api.cloudflare.com` を許可済み＝init-firewall.sh。ブロッカーはネットワークではなく ADR-0003 §5 が定める「鍵を境界内に置かない」）。
- このファイル自身が陳腐化しうる。**矛盾を感じたら §「確かめ方」を実行**し、結果でこのファイルを更新してから進める。
