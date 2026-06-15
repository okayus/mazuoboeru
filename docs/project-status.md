# プロジェクト現況（mazuoboeru）

> **このファイルは「いまどこにいて、ここから何が要るか」を共有する“生きたステータス”。**
> 新セッションは `CLAUDE.md` の次にこれを読む。古い手順書ではなく現況なので、
> **鵜呑みにせず §「現況の確かめ方」で実機確認してから動く**こと（ドキュメントは遅れる、本番は嘘をつかない）。
> - 長期のフェーズ計画 → [roadmap.md](roadmap.md)（ここでは重複させない）
> - 後戻りしにくい決定の理由 → [docs/adr/](adr/)（正典）
> - 用語の正典 → [CONTEXT.md](../CONTEXT.md) / 働き方の規約 → [CLAUDE.md](../CLAUDE.md)
>
> **最終更新: 2026-06-15**（更新したら日付と §「いま動いているもの」を直す）

---

## 30秒で把握

- **何**: 学んだことをクイズ化して反復で覚える **公開 SaaS**。マルチユーザーで、**クイズは必ず公開**され誰でも他人のクイズに挑戦できる。中心課題は UGC の安全表示（XSS サニタイズ）・モデレーション・サーバー側採点（カンニング防止）。
- **基盤**: Cloudflare Workers + D1 / React 19 + Vite / Hono / Drizzle。**TS は関数のみ（class 禁止）**。デプロイは Workers Builds（キーレス）、push/PR/merge はホスト側リレー。
- **いま**: **Phase 1 の最初の縦切り（ログイン→作成→公開→挑戦→サーバー採点）は実装され main にマージ・本番デプロイ済み**。バックエンドは PAT で一周動作する。
- **ログイン開通**: **GitHub ログインが本番・dev とも開通**（2026-06-14）。MVP は **GitHub のみ**（Google は可逆保留＝ADR-0001）。Phase 1 縦切りはブラウザで端から端まで動作する。
- **直近の前進**（2026-06-15）: **B1 通報チャネルを merge・本番稼働**（#32。`0002_report.sql` は **Workers Builds が自動適用**＝人手 migrate 不要、`report` テーブル実在を確認）。**D1 マイグレーションは自動適用**という事実を正典化（#35。旧「人手で当てる」は誤りだった＝§ハマりどころ）。**コミット時に本番状態の断定を検証する verify-prod-claims フックを追加**（#36、§開発の進め方）。**残りの Phase 1 は A4 e2e / B3 cli**。
- **本番**: https://mazuoboeru.shiraoka.workers.dev

---

## いま本番で動いているもの（2026-06-15 実機確認）

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

> つまり **データ層・公開読み取り・採点・セキュリティ境界・ログイン入口まで本番で生きている**。Phase 1 縦切りは人間がブラウザで端から端まで使える状態。

### main にマージ済みの実装（Phase 1 縦切り）
9 テーブル（user / oauth_account / session / api_token / quiz / question / choice / attempt / attempt_answer）＋ `drizzle/0001_phase1_slice.sql`（CHECK/FK/索引）。セッション（30 日スライディング・sha256 保存・host-only Cookie）／OAuth（arctic、検証済みメール限定 auto-link）／CSRF(Origin)＋セキュリティヘッダ／PAT（`mzo_pat_`・既定無期限・session 限定発行）／クイズ author CRUD＋公開ゲート（採点可能性をサーバ強制）／公開タイムライン＋挑戦ビュー／strict 採点（純粋関数、vitest 15 件）／react-markdown + rehype-sanitize の SPA（バンドル分割・SWR・memo 済み）。

---

## ここから必要なもの（きっちりした手順ではなく「何が要るか」）

### A. Phase 1 を「人が実際に使える」状態にする — ✅ ほぼ完了（2026-06-14）

> **MVP は GitHub ログインのみ**（Google は可逆保留＝ADR-0001。動機: Google の console 作業が複数プロジェクトでスケールしない／無料プロジェクト数の上限）。Google を後で足すのは redirect URI 追加＋secret 投入で無痛。

1. ~~**GitHub OAuth App 作成**~~ → ✅ 完了（prod 用1個・dev 用1個。OAuth App は callback 1個のみ＝**環境ごとに別 App** が要る）。
2. ~~**本番 Worker Secrets 投入**（`pnpm secrets:prod`＝`apps/web/scripts/put-prod-secrets.sh`、ADR-0003）~~ → ✅ 完了。`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`/`PAT_PEPPER` 投入、`/auth/github` 開通確認。
3. ~~**dev 用 GitHub OAuth App ＋ `.dev.vars`**~~ → ✅ 完了。`pnpm dev --host`（host 5373）でローカル一周確認（ローカル D1 はシード入り・自動 migrate）。
4. **Playwright e2e** で GitHub ログイン込みの一周を自動化（スキル `cloudflare-workers-e2e-playwright`。strict CSP × Vite HMR の罠に注意）。← **残タスク**

> `RP_ID` / `ORIGIN` は wrangler.jsonc が本番値、`.dev.vars` が localhost 上書き。dev は host 経由 5373 に合わせ `ORIGIN=http://localhost:5373` と dev App の callback を一致させる。

### B. Phase 1 スコープでまだ無い機能（縦切りに含めなかった分）

- ~~通報チャネル~~ → ✅ **実装・merge・本番デプロイ済み（#32）**。`report` テーブル（target_type=quiz/question/user・reason_category 5種・自由記述≤500字・status open/actioned/dismissed）＋ `POST /api/reports`（**session 限定＝PAT 不可**・対象存在検証・同一(reporter,target)は冪等・**レート制限 10件/rolling 24h/ユーザ**は DB count で実装＝unsafe ratelimit binding は 10/60s 粒度しか無く日次に使えないため）＋ 挑戦画面のクイズ通報ボタン。ローカル D1 で一周検証済み（201 / 重複 200 / 自己通報 400 / 不在 404 / 不正 400 / 超過 429）。triage は当面 `wrangler d1 execute` で SELECT（admin UI は Phase 4）。**本番 D1 へ `0002_report.sql` は Workers Builds が #32 デプロイ時に自動適用済み**（`report` テーブル実在を host `wrangler d1 execute --remote` で確認。migration は手で当てない＝§ハマりどころ「D1 マイグレーションは自動適用」）。残タスクなし。
- ~~認証ルートのレート制限（B2）~~ → ✅ **完了・デプロイ済み**（#28 merge＋Workers Builds success）。observability(100%) ＋ unsafe ratelimit binding `AUTH_RATE_LIMITER`(30/60s)・fail-open を OAuth begin/callback に（wrangler 3.x は top-level `ratelimits` 非対応＝unsafe 形式）。スキル `cloudflare-workers-bot-scan-defense`。**稼働の確定は Dashboard**（CLI は v3 偽陰性＝§ハマりどころ）。投稿の per-user 制限は別途（残）。
- **`apps/cli` の最小実装**（PAT を env から読んで `POST /api/quizzes` を叩く薄い Node スクリプト、npm 未配信）。AI/CLI でのクイズ量産導線。

### C. その先（Phase 2 以降の入口）

検索・タグ、学習ダッシュボード、追加設問形式（`boolean`→`short`→`cloze`）、Passkey、通報の Discord/メール通知、SRS（Phase 3）、モデレーション管理画面（Phase 4）。詳細と順序は [roadmap.md](roadmap.md)。

> **実スキーマ変更時は必ず** スキル `cloudflare-d1-drizzle-migration` を読む（constraint 変更/table rebuild は FK OFF のカスケード削除トラップ＋要バックアップ。列追加は安全）。

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
