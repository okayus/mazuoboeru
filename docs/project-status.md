# プロジェクト現況（mazuoboeru）

> **このファイルは「いまどこにいて、ここから何が要るか」を共有する“生きたステータス”。**
> 新セッションは `CLAUDE.md` の次にこれを読む。古い手順書ではなく現況なので、
> **鵜呑みにせず §「現況の確かめ方」で実機確認してから動く**こと（ドキュメントは遅れる、本番は嘘をつかない）。
> - 長期のフェーズ計画 → このファイル末尾 §「ロードマップ（フェーズ計画）」（旧 `roadmap.md` を統合）
> - 後戻りしにくい決定の理由 → [docs/adr/](adr/)（正典）
> - 用語の正典 → [CONTEXT.md](../CONTEXT.md) / 働き方の規約 → [CLAUDE.md](../CLAUDE.md)
>
> **最終更新: 2026-06-22**（更新したら日付と §「いま動いているもの」を直す）

---

## 30秒で把握

- **何**: 学んだことをクイズ化して反復で覚える **公開 SaaS**。マルチユーザーで、**クイズは必ず公開**され誰でも他人のクイズに挑戦できる。中心課題は UGC の安全表示（XSS サニタイズ）・モデレーション・サーバー側採点（正誤の単一の真実／即時フィードバック＝競争的カンニング対策ではない＝[ADR-0010](adr/0010-server-side-grading-rationale.md)）。
- **基盤**: Cloudflare Workers + D1 / React 19 + Vite / Hono / Drizzle。**TS は関数のみ（class 禁止）**。デプロイは Workers Builds（キーレス・**docs-only＝`docs/*`/`*.md` は watch path exclude でデプロイ skip／CI `ci` は required で常時走る**＝2026-06-19）、push/PR/merge はホスト側リレー。**node は host/sandbox/CI とも node24**（ADR-0005。`apps/cli` の `.ts` はビルド無しネイティブ実行）。
- **いま**: **Phase 1 の最初の縦切り（ログイン→作成→公開→挑戦→サーバー採点）は実装され main にマージ・本番デプロイ済み**。バックエンドは PAT で一周動作する。
- **Phase 2「発見と振り返り」実装・本番反映済み（2026-06-17・実機確認）**: タグ＋上位下位タクソノミ（広いタグ検索で下位も一致・ドリルチップ）／学習ダッシュボード（全体・実効タグ別正答率・ストリーク）／Favorite「my hot」／挑戦フロー再設計（1画面1問・設問別の本人正答率）。PR #44–#48・各 Workers Builds success（migration 0003–0005 自動適用を確認）。設計は [ADR-0006](adr/0006-dashboard-aggregation-semantics.md)/[ADR-0007](adr/0007-tag-subsumption-taxonomy.md)。残: 人気/ランキング・作者ページ・追加設問形式・Passkey・通報の Discord 通知・CLI npm 配信。
- **ログイン開通**: **GitHub ログインが本番・dev とも開通**（2026-06-14）。MVP は **GitHub のみ**（Google は可逆保留＝ADR-0001）。Phase 1 縦切りはブラウザで端から端まで動作する。
- **直近の前進**（2026-06-15〜16）: **B1 通報チャネルを merge・本番稼働**（#32。`0002_report.sql` は **Workers Builds が自動適用**＝人手 migrate 不要、`report` テーブル実在を確認）。**D1 マイグレーションは自動適用**という事実を正典化（#35。旧「人手で当てる」は誤りだった＝§ハマりどころ）。**コミット時に本番状態の断定を検証する verify-prod-claims フックを追加**（#36、§開発の進め方）。**B3 cli を merge・本番デプロイ・本番実証**（#38。`apps/cli`＝PAT でクイズ作成/公開する薄い CLI `mzo`。あわせて **host/sandbox/CI を node24 に統一し `.ts` をビルド無しネイティブ実行**＝ADR-0005。本番で実 PAT による create→作者 API で内容一致→非公開確認→ソフト削除まで実機確認）。**A4 e2e は完了・本番反映済み**（**PR #39 merge＝main `012cfaf`・Workers Builds デプロイ success**。コンテナ内 `pnpm e2e` 6/6 緑。本番コードに認証バイパスを足さず session seam＋ビルド成果物を `wrangler dev` で駆動。`.docker/Dockerfile` の `INSTALL_PLAYWRIGHT=true` で Chromium をビルド時に焼き込み＝コンテナ完結／runtime egress ゼロ。**この e2e が挑戦ビューの本番バグ＝React #310 hooks 違反を検出・修正**＝本番バンドルも修正後 `index-91zgNzP4.js` に更新済み）。**ドッグフーディング作成者ゲート（allowlist）を実装・merge・本番デプロイ・本番でゲート ON 実証**（#41＝main `394b06a`。`ALLOWED_CREATORS` secret 投入済み＝列挙メールのアカウントのみ作成/公開可。作者のブラウザ作成成功を確認＝自己ロックアウト無し）。**残りの Phase 1 は投稿 per-user レート制限のみ**（一般公開前で足り、当面は allowlist で代替）。
- **次の実装の設計確定（2026-06-18 grill）**: Phase 3「定着」を **Review List（設問単位の手動復習プール＝旧 favorite 置換）＋ドリル**として設計確定（SM-2 在庫スケジューラは持たない・再出題の間隔は将来の通知へ／[ADR-0008](adr/0008-review-list-manual-pool.md)・[ADR-0006](adr/0006-dashboard-aggregation-semantics.md) 追記・[CONTEXT.md](../CONTEXT.md) の Review List/Drill）。**実装は別セッション**（本セッションは設計＋ドキュメントのみ）。ツールチェインは **vite-plus を本採用**（[ADR-0009](adr/0009-vite-plus-toolchain.md)）＝導入済み・**テストを `vp test` に一本化**（vitest 単一化・apps/web 54/apps/cli 26 緑）。lint/fmt スクリプト・CI 配線と dev/build（Rolldown）移行は実装セッション（dev/build は `@cloudflare/vite-plugin`＋wrangler v4 と連動）。
- **Phase 3 前のリファクタ完了（2026-06-18）**: 「ドメインが型/ADT/制約/テストで意味を表現できているか」のコード点検を受けた硬化。(1) **採点の動機を anti-cheat から再定義**（ランキング無し・学習は内面的＝[ADR-0010](adr/0010-server-side-grading-rationale.md)・CLAUDE/security/concept/features/tech-stack/data-model/CONTEXT を一括追従）。(2) **クライアント↔サーバ契約を Hono RPC で単一真実化**（全 router をメソッドチェーン化＋`AppType` export、`src/api.ts` は `hc<AppType>`＋`InferResponseType` で応答 DTO をサーバ由来に＝二重定義撤廃・[ADR-0011](adr/0011-hono-rpc-typed-contract.md)）。(3) A' 硬化: PAT scope を `Scope` union 化（`requireScope` のタイポをコンパイル捕捉）／JSON 配列パーサを `lib/json.ts` に集約／`ApiErrorCode` union＋`apiError()` でエラー応答を型付け／採点配線を純関数 `decideAnswer`（判別共用体）へ抽出＋vitest 14件。**検証: tsc(web/cli/e2e)・unit(web 68/cli 26)・build・e2e 6/6 すべて緑、client バンドルに worker コード混入なし**。**新 route はメソッドチェーンで書くこと**（分離文だと RPC 型が乗らない）。**PR #53 で merge・本番デプロイ済み**（main `3d5287a`・Workers Builds success。本番で apiError 封筒 `csrf_origin_mismatch`・timeline `related:null` を実機確認）。
- **Phase 3 Slice 1（Review List）本番反映・実機確認済み（2026-06-19・#55＝main `ae82f1e`）**: 旧 favorite（クイズ単位）を設問単位の手動復習プールに置換（`0006_review_list.sql`＝`review_list` 新設・`favorite` DROP〔お試しデータ破棄・[ADR-0008](adr/0008-review-list-manual-pool.md)〕／backend `review-list-queries.ts`＋`routes/review-list.ts`／frontend `ReviewList` ビュー＋挑戦カードの「☆ 復習リストに追加」トグル。Drill/review_answer/ダッシュボード算入は Slice 2）。**#55 のマージで Workers Builds がトリガを取りこぼし**（Builds 履歴に `ae82f1e` 行が生成されず＝未トリガ・webhook 不発の単発事象。連携・構成・監視パス・prod=main は健全で #51–#54 は正常発火）→ docs 追記コミット（#56）で**再トリガして反映**（マージ約64秒後にデプロイ `b414a8aa`）。**実機確認**: 本番 D1 に `review_list` 実在・`favorite` 消滅（0006 適用）／`/api/review-list` 401（session ガード）／旧 `/api/favorites` は撤去で SPA フォールバック 200。トリガ取りこぼし時の復旧手順（push 済み claude/* は amend 禁止＝fast-forward で前進修正・Relay-Merge は連続トレーラー）は auto-memory `relay-no-amend-pushed-branch` に記録。
- **Phase 3 Slice 2（Drill）本番反映・実機確認済み（2026-06-19・#58＝main `25340ef`／status 訂正 #59）＝Phase 3「定着」の中核ループ（Review List＋Drill）完成**: 復習リストを1問ずつ解き直す Drill。grill で確定＝取得形=プール一括（`GET /api/drill`）／採点=純関数 `gradeQuestion` を抽出して Attempt と共有（Drill は **Attempt を作らずステートレス・追記専用**＝進行状態なし・離脱したら最初から）／dashboard=`review_answer` を streak・活動量・全体/タグ別/設問別 正答率へ**一律算入**（[ADR-0006](adr/0006-dashboard-aggregation-semantics.md) 2026-06-19 追記）。migration `0007_review_answer.sql` 自動適用。検証 tsc・unit 73・build・e2e 6/6・SQL スモーク・本番 curl すべて緑。[CONTEXT.md](../CONTEXT.md) の Drill 定義を鋭利化、memory `attempt-to-become-stateless-future`（Attempt の将来ステートレス化＝別タスク）。
- **選択肢を毎回ランダムに並べ替える（本番反映・実機確認済み 2026-06-20・#61＝main `099571a`）**: 設問提示のたびに選択肢の表示順をシャッフル（位置依存の暗記「答えは3番目」を断つ＝「まず覚える」の定着思想）。挑戦（[[Attempt]]）・ドリル（[[Drill]]）両画面。**grill 4論点の決着**: ①場所＝**クライアント表示のみ**（UI の話＝サーバ・DTO（[ADR-0011](adr/0011-hono-rpc-typed-contract.md)）・migration・新 route いずれも無し。サーバは `choice.position` の正準順を返すまま）／④乱数源＝client `Math.random()`（cosmetic・anti-cheat ではない＝[ADR-0010](adr/0010-server-side-grading-rationale.md)）／②③粒度＝**提示（マウント）ごと**（純関数 `shuffle()` を `useState(() => shuffle(choices))` で各カードのマウント時に1回振る。1マウント内は固定、前へ/次へ・リロード・回答済みでも**再提示で並べ替え**。フィードバックは ID で正しさ保持＝✓/選択ハイライトは位置に追従）。**採点は選択肢 ID の集合一致（`gradeSelection`）で順序非依存＝正誤への影響ゼロ**。位置依存の選択肢文（「2と4の両方」等）は壊れるが **opt-out は作らず制約を文書化**（[features.md](features.md) §3）＝無条件シャッフル。実装: `apps/web/src/lib/shuffle.ts`（純 Fisher–Yates・rng 注入・vitest 5件＝**src 初のユニットテスト**につき `vitest.config.ts` の include へ `src/**` 追加）＋ `Challenge.tsx`/`Drill.tsx` の map 差し替え。検証: tsc・unit 78・build・**e2e 6/6**（radio はテキスト選択のため無修正で緑）。**本番確認（2026-06-20）**: #61 を relay が squash merge＝main `099571a`、`Workers Builds: mazuoboeru`・`ci` とも **success**、`claude/*` ブランチ削除済み（再 merge ループ無し）。本番 `/health` ok・**SPA が shuffle ビルドの `index-Uw-p6GMR.js` を配信**（クライアント表示のみゆえ**バンドルハッシュ一致が反映の証拠**＝curl ではシャッフル自体は不可視）。ADR/CONTEXT 変更なし（後戻り容易・新ドメイン用語なし）。
- **ツールチェイン段1（lint/fmt/CI）本番反映済み（2026-06-20・#63＝main `a5204bd`）**: vite-plus の Oxlint/oxfmt を採用（[ADR-0009](adr/0009-vite-plus-toolchain.md) §段1）。root `.oxlintrc.json`＝`correctness`＋`react/no-danger`＋`no-restricted-imports(rehype-raw)`＝**[ADR-0004](adr/0004-ugc-markdown-rendering.md)（生 HTML 非描画）を lint で CI 強制化**（現状違反なし＝将来の退行ガード）。各パッケージに `lint`/`fmt`/`fmt:check`。**配線の要点**: `vp lint`/`vp fmt` は vite config を読むため**パッケージ CWD 実行必須**、lint は `-c ../../.oxlintrc.json --deny-warnings`（root config を自動発見しない）、raw `oxlint`/`oxfmt` は LSP 専用で CLI 不可。既存 lint 指摘3件を修正＋oxfmt で36ファイル一括整形（単独コミット・wrangler.jsonc コメント保持・markdown/CSS も整形対象だが docs/ はパッケージ外で対象外）。CI は `Typecheck→Lint→Format→Build→Test`。**検証**: CI `ci` success（**新 Lint/Format ステップも GitHub Actions で緑**）・**Workers Builds success**（整形が apps/web を触り本番 CD 発火＝機能同一の再デプロイ・`/health` 200・public read 200）。**段2（dev/build の Rolldown 化＝wrangler 3→4＋@cloudflare/vite-plugin 1.x＋`vp build`/`vp dev`＋ratelimit を `unsafe`→正式 `ratelimits` 形）は別セッション**（grill で互換 spike 済み＝`vp build`×cloudflare plugin 成立・vite-plus=vite8・本番 CD に最も触れる塊・[ADR-0009](adr/0009-vite-plus-toolchain.md) 2026-06-20 追記に方針）。
- **クイズ保存の D1 100-param バグ修正（本番反映・実機実証済み 2026-06-21・#65＝main `4a22827`）**: `POST/PATCH /api/quizzes` が大きいクイズ（総 choice >20）で D1 の bound-param 上限超過により素の 500 になっていた既知バグ（旧 §ハマりどころ）を解消。`contentStatements()` の multi-row INSERT を ≤100 params/文 にチャンク分割（choice 20行・question 16行・同一 `d.batch()` で atomic 維持＝create/PATCH 同時に直る）＋`worker/db` 層 初の単体テスト（`.toSQL().params` で全文 ≤100 を回帰ガード）。検証 tsc・lint・fmt・build・unit 84・Workers Builds success、**PAT で 7問28択を `mzo create`→201（旧 500）→publish→公開 GET 検証**まで実機確認。スキーマ変更なし＝migration なし（上限は per-statement＝docs 確認）。
- **短答（short）設問形式を本番反映・実機確認済み（2026-06-22・#67＝main `c91b6b1`・[ADR-0012](adr/0012-short-answer-grading-normalization.md)）**: 自由入力でタイプする一問一答（例「…各 namespace へのポインタをまとめた構造体は？」→「nsproxy」）。採点は **機械的正規化（NFKC＋trim＋連続空白畳み＋小文字化を入力と許容解の両辺へ）＋許容解リストへの完全一致**（あいまい一致なし・`worker/domain/short-answer.ts`）。許容解は `question.answer`（nullable JSON `{"accept":[生文字列,...]}`・mcq は NULL・`accept[0]` を正準解表示）、cloze は将来 `{"blanks":[...]}` へ拡張。`gradeQuestion`/`decideAnswer`・送信 zod・応答 DTO を `question.type` で**判別共用体化**（[ADR-0011](adr/0011-hono-rpc-typed-contract.md)）、`answer` は公開射影に非露出（[ADR-0010](adr/0010-server-side-grading-rationale.md)・client バンドルに採点コード非混入を grep 確認）。許容解と学習者入力は**プレーンテキスト**（[ADR-0004](adr/0004-ugc-markdown-rendering.md)）。公開ゲートは「許容解≥1」。作成 UI（テキスト入力・許容解 textarea）・挑戦・ドリル対応。**migration 0008（最大の難所）**: `question` の CHECK 変更（rebuild）は D1 で `DROP TABLE question` が子（choice/review_list=CASCADE, attempt_answer/review_answer=NO ACTION）をカスケード破壊する。`foreign_keys=OFF` は D1 が無視・`defer_foreign_keys` は文跨ぎで効かない（実証）→ **子4テーブルを新 question へ repoint してから drop→rename**＋**choice/review_list を CASCADE→NO ACTION 降格**（choice 削除はアプリ側＝[ADR-0012] Addendum・[data-model](data-model.md)）。**本番反映の確認**: host が本番エクスポートの**実データで dry-run**（行数全保全・`foreign_key_check` clean）＋ `wrangler d1 export` backup → #67 マージで **`Workers Builds: mazuoboeru` success ＝ `d1 migrations apply --remote && deploy` 実行** → マージ後 remote 行数が **question105/choice415/review_list57/attempt_answer95/review_answer24 で全保全**・`/health` 200・short-answer バンドル配信を確認。tsc(web/e2e)・lint・fmt・unit 106・build も green。CONTEXT.md に Short Answer／Accepted Answer／Answer Normalization を追加。
- **その先の実装候補（次々セッション以降）**: ①Phase 2 残〔人気/ランキング・作者ページ・追加設問形式 `short`（実装・ローカル検証済＝ADR-0012・本番反映前）→`boolean`→`cloze`・Passkey・通報の Discord 通知・CLI npm 配信〕／②Phase 3 残〔タグ別習熟度（Drill/Attempt の蓄積を実効タグで集計）〕／③ツールチェイン段2〔dev/build の Rolldown 化＝wrangler 3→4＋@cloudflare/vite-plugin 1.x＋`vp build`/`vp dev`＋ratelimit 正式形移行。段1（lint/fmt/CI）は #63 反映済み＝[ADR-0009](adr/0009-vite-plus-toolchain.md)〕／④Phase 1 残〔投稿 per-user レート制限＝一般公開前・当面 allowlist で代替〕／⑤将来〔Attempt ステートレス化＝memory `attempt-to-become-stateless-future`・要 ADR〕。
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
| **Review List（#55・Phase 3 Slice 1。旧 Favorite を置換）** | ✅ **稼働（2026-06-19 実機確認）** | `GET /api/review-list` **401**（session 限定）。本番 D1 に `review_list` 実在・`favorite` は `0006` で DROP 済み（お試しデータ破棄・[ADR-0008](adr/0008-review-list-manual-pool.md)）。旧 `/api/favorites` は撤去＝SPA フォールバック 200。設問単位の手動プール（Drill/算入は #58 Slice 2 で実装済み） |
| **Drill（#58・Phase 3 Slice 2）** | ✅ **稼働（2026-06-19 実機確認）** | `GET /api/drill` **401**・`POST /api/drill/answers` は Origin 無し **403**／Origin 付き未ログイン **401**（session 限定・CSRF 結線）。復習リストを1問ずつ→サーバ採点（純関数 `gradeQuestion` を Attempt と共有）→即時フィードバック→「覚えた＝外す／まだ＝残す」。**Attempt を作らずステートレス・追記専用**（`review_answer`）。WB success＝`0007` 自動適用。ストリーク・活動量・全体/タグ別/設問別 正答率へ一律算入（[ADR-0006](adr/0006-dashboard-aggregation-semantics.md)・[ADR-0008](adr/0008-review-list-manual-pool.md)） |
| **挑戦フロー再設計（#48・Phase 2）** | ✅ **稼働** | 1画面1問＋設問別の本人正答率（私的）。**e2e 6/6 緑**で再設計 golden-path をコンテナ内 Chromium 実機通過 |
| **選択肢シャッフル（#61）** | ✅ **稼働（2026-06-20 実機確認）** | 挑戦・ドリルの選択肢を提示（マウント）ごとにランダム表示（クライアントのみ・採点は ID 集合一致で順序非依存＝正誤に影響なし）。main `099571a`・Workers Builds success・本番 SPA が shuffle ビルドの `index-Uw-p6GMR.js` を配信。位置依存の選択肢文は非対応（[features.md](features.md) §3） |
| **短答（short）設問形式（#67）** | ✅ **稼働（2026-06-22 実機確認）** | 自由入力をタイプ→サーバー正規化採点（[ADR-0012](adr/0012-short-answer-grading-normalization.md)）。main `c91b6b1`・`Workers Builds: mazuoboeru` success＝migration 0008（`question` rebuild＋`answer` 列＋type CHECK に `short`）適用。host が本番実データで dry-run＋backup、マージ後 remote 行数 105/415/57/95/24 全保全・`foreign_key_check` clean。`answer` は公開射影に非露出 |

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
**設計（2026-06-18 grill・[ADR-0008](adr/0008-review-list-manual-pool.md)）**: アルゴリズム的 SRS（SM-2・`review_state`・「今日の復習」due キュー）は**作らない**。代わりに **Review List**（UI "my hot list"・**設問単位**の手動プール・旧 favorite を置換）＋**ドリル**（1問ずつ再回答＋即時フィードバック・「覚えた＝外す／まだ＝残す」）。ドリル回答（`review_answer`）はストリーク・活動量に算入（[ADR-0006](adr/0006-dashboard-aggregation-semantics.md) 追記）。**再出題の間隔（スペーシング）は将来の通知機能へ後ろ倒し**。タグ別習熟度は後続。実装は**縦切り2スライス**。

- ✅ **Slice 1（Review List・本番反映済み 2026-06-19・#55＝main `ae82f1e`）**: `review_list`(user_id, question_id) 新設＋旧 `favorite` DROP（[ADR-0008](adr/0008-review-list-manual-pool.md)・お試しデータ破棄）。backend `review-list-queries.ts`＋`routes/review-list.ts`（session 限定・公開設問のみ追加可）／frontend `ReviewList` ビュー（フラット・新しい順）＋挑戦カードの「☆ 復習リストに追加」トグル（クイズ単位 favorite トグルは廃止）。実機確認は §「いま本番で動いているもの」。
- ✅ **Slice 2（Drill・本番反映済み・実機確認 2026-06-19・#58＝main `25340ef`）**: grill（2026-06-19）で3点確定＝**取得形=プール一括**（`GET /api/drill` が選択肢つき・`is_correct` 伏せ・公開のみを一括返却、クライアント主導で1問ずつ）／**採点=純関数 `gradeQuestion` を抽出**して Attempt と共有（Drill は **Attempt を作らずステートレス・追記専用** ＝進行状態を持たず離脱したら最初から）／**dashboard 合流=(2) 全指標一律**（`review_answer` を streak・活動量・全体/タグ別/設問別 正答率の**すべて**へ算入＝[ADR-0006](adr/0006-dashboard-aggregation-semantics.md) に 2026-06-19 追記。タグ別は `review_answer`→`question`→`quiz` の read 時 join で quizId 導出、`computeStreak`/`bundleTagAccuracy` は不変のまま attempt facts に concat）。実装: migration `0007_review_answer.sql`（テーブル追加＝rebuild なし）／`db/drill-queries.ts`＋`routes/drill.ts`（GET プール＋POST `/answers`・session 限定・メソッドチェーン）／`userQuestionStats` を attempt∪review_answer に拡張／frontend `views/Drill.tsx`＋ReviewList「▶ ドリルを始める」導線。「覚えた＝外す」は既存 `DELETE /review-list/:id` 再利用・「まだ」は client no-op。**検証: tsc・unit 73（`gradeQuestion` +5）・build（client バンドルへ採点コード非混入を grep 確認）・e2e 6/6（golden-path が refactor 後の `decideAnswer` を通過）・`0007` ローカル適用＋pool/stat/facts の SQL スモーク すべて緑**。**本番反映済み: #58 を relay が squash merge → `Workers Builds: mazuoboeru` success ＝ `0007` 自動適用**（`GET /api/drill` 401・`POST /api/drill/answers` Origin 無し 403／付き未ログイン 401・dashboard/review-list 401 を実機確認＝§「いま本番で動いているもの」の Drill 行）。
- **ツールチェイン**: vite-plus 本採用（[ADR-0009](adr/0009-vite-plus-toolchain.md)）＝導入済み・test は `vp test` 一本化済み。lint/fmt スクリプト・CI 配線・dev/build（Rolldown）移行は**別タスク**（Slice には含めない・`@cloudflare/vite-plugin`＋wrangler v4 連動）。

### Phase 4 — 健全な運営・拡張
モデレーション管理画面（`/admin/*` を **Cloudflare Access** で IdP ゲート）／自動スパム検知・監査ログ／D1 週次バックアップ（スキル `cloudflare-d1-weekly-backup-via-pr`）／集計のキャッシュ・事前集計（`quiz_stats`）／ハード削除＋データエクスポート・アカウント削除（GDPR）／編集履歴 `quiz_revision`＋`attempt.quiz_title_snapshot` で履歴の自立性確保／コメント（モデレーション前提）・PWA。

### 持ち越し（再開条件つき）
- **短答採点の正規化**（大小・全半角・表記ゆれ・別解）— Phase 2 で `short` 追加時に詰める。
- **custom domain** の購入・移行 — ローンチ後。redirect URI を workers.dev と custom で併存させ段階移行（subdomain なし URL は構造上不可＝custom domain が正解）。
- **CLI の npm 配信** — Phase 2（`esbuild` → `npx`）。
- **admin UI / 自動アクション**（N 件通報で自動 hidden 等）— Phase 4。
- **Attempt のステートレス化**（進行状態・再開を廃し、Drill と同様「採点して履歴だけ溜める」へ）— ユーザ意向の将来タスク（2026-06-19 Slice 2 grill で表明、スコープ膨張を避け分離）。CONTEXT.md の [[Attempt]] 定義（未回答から再開）改訂＋未完了 Attempt 保持/再開ロジック撤去＋公開集計（完了 Attempt のみ）への影響を伴う＝着手時に ADR 候補。auto-memory `attempt-to-become-stateless-future`。

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
- **【修正済み 2026-06-21・#65＝main `4a22827`】クイズ作成/編集が大きいクイズで 500 だった（D1 の bound パラメータ上限 100）**: `createDraftQuiz()`/`replaceDraftContent()` → `contentStatements()`（`worker/db/quiz-queries.ts`）が **全 question を1本・全 choice を1本の multi-row INSERT** にまとめており、D1 の「**1ステートメント**あたり bound パラメータ ≤100」（docs 確認＝per-batch ではなく per-statement・batch 合計は超えてよい）を超えると D1 が拒否、route が catch せず **Hono 既定の素の 500**（`apiError` JSON ではない）になっていた。choice が 5 params/行で先に律速＝**総 choice >20（≒設問 >5）で破綻**（question は 6 params/行で >16設問）。実測（本番）: 20 choices=100 params→201、25 choices=125 params→500 で閾値は厳密に100。**直し**: `contentStatements()` の INSERT を ≤100 params/文 にチャンク分割（choice 20行・question 16行、同一 `d.batch()` で atomic 維持）→ create と PATCH が同時に解消＋`worker/db/quiz-queries.test.ts`（worker/db 層 初テスト・`.toSQL().params` で全文 ≤100 を回帰ガード）。**本番実証（2026-06-21）**: PAT で **7問28択**を `mzo create`→**201**（旧経路は 500）→ publish→公開 GET で全7問28択・答え非開示を確認。旧「暫定回避＝Linux 教材を5本に分割」はもう不要（分割のまま公開済み・統合は任意）。
- このファイル自身が陳腐化しうる。**矛盾を感じたら §「確かめ方」を実行**し、結果でこのファイルを更新してから進める。
