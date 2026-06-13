# プロジェクト現況（mazuoboeru）

> **このファイルは「いまどこにいて、ここから何が要るか」を共有する“生きたステータス”。**
> 新セッションは `CLAUDE.md` の次にこれを読む。古い手順書ではなく現況なので、
> **鵜呑みにせず §「現況の確かめ方」で実機確認してから動く**こと（ドキュメントは遅れる、本番は嘘をつかない）。
> - 長期のフェーズ計画 → [roadmap.md](roadmap.md)（ここでは重複させない）
> - 後戻りしにくい決定の理由 → [docs/adr/](adr/)（正典）
> - 用語の正典 → [CONTEXT.md](../CONTEXT.md) / 働き方の規約 → [CLAUDE.md](../CLAUDE.md)
>
> **最終更新: 2026-06-13**（更新したら日付と §「いま動いているもの」を直す）

---

## 30秒で把握

- **何**: 学んだことをクイズ化して反復で覚える **公開 SaaS**。マルチユーザーで、**クイズは必ず公開**され誰でも他人のクイズに挑戦できる。中心課題は UGC の安全表示（XSS サニタイズ）・モデレーション・サーバー側採点（カンニング防止）。
- **基盤**: Cloudflare Workers + D1 / React 19 + Vite / Hono / Drizzle。**TS は関数のみ（class 禁止）**。デプロイは Workers Builds（キーレス）、push/PR/merge はホスト側リレー。
- **いま**: **Phase 1 の最初の縦切り（ログイン→作成→公開→挑戦→サーバー採点）は実装され main にマージ・本番デプロイ済み**。バックエンドは PAT で一周動作する。
- **ただし最大の穴**: **本番の OAuth ログインが未設定**。ブラウザから Google/GitHub で実際にはまだログインできない（→ §「ここから必要なもの A」）。
- **本番**: https://mazuoboeru.shiraoka.workers.dev

---

## いま本番で動いているもの（2026-06-13 実機確認）

| 項目 | 状態 | 確認したこと |
| --- | --- | --- |
| `/health`・SPA 配信 | ✅ | `{"status":"ok"}` / SPA HTML（正タイトル）を配信 |
| **本番 D1 マイグレーション適用** | ✅ **適用済み** | `/api/public/quizzes` が 500 ではなく `{"quizzes":[]}` を返す＝テーブル実在 |
| 公開タイムライン / 挑戦 API | ✅ | `/api/public/quizzes(/:id)` が JSON 応答（答え非開示の射影） |
| 認証セッション API | ✅ | `/api/auth/me` が `{"user":null}`（未認証） |
| 認可ガード | ✅ | `GET /api/quizzes/mine`→401、`POST /api/tokens`→403（CSRF Origin 検証が発火） |
| セキュリティヘッダ | ✅ | strict CSP（`default-src 'self'` ベース）・HSTS・`X-Content-Type-Options:nosniff`・`X-Frame-Options:DENY` が本番で付与 |
| **本番 OAuth ログイン** | ❌ **未設定** | `/auth/google`・`/auth/github` が `Location: /?auth_error=provider_unconfigured`＝client secret 未投入 |

> つまり **データ層・公開読み取り・採点・セキュリティ境界は本番で生きている**が、**人間がログインする入口だけが開通していない**。

### main にマージ済みの実装（Phase 1 縦切り）
9 テーブル（user / oauth_account / session / api_token / quiz / question / choice / attempt / attempt_answer）＋ `drizzle/0001_phase1_slice.sql`（CHECK/FK/索引）。セッション（30 日スライディング・sha256 保存・host-only Cookie）／OAuth（arctic、検証済みメール限定 auto-link）／CSRF(Origin)＋セキュリティヘッダ／PAT（`mzo_pat_`・既定無期限・session 限定発行）／クイズ author CRUD＋公開ゲート（採点可能性をサーバ強制）／公開タイムライン＋挑戦ビュー／strict 採点（純粋関数、vitest 15 件）／react-markdown + rehype-sanitize の SPA（バンドル分割・SWR・memo 済み）。

---

## ここから必要なもの（きっちりした手順ではなく「何が要るか」）

### A. Phase 1 を「人が実際に使える」状態にする（最優先・大半は人手）

1. **本番 OAuth クライアント作成**（Google / GitHub）。redirect URI は両方とも
   `https://mazuoboeru.shiraoka.workers.dev/auth/callback/{google,github}`。
2. **本番 Worker Secrets 投入**（`wrangler secret put`、コードは名前参照のみ）:
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `PAT_PEPPER`。
   → 投入後 `/auth/google` の `Location` が `accounts.google.com` に変われば開通（§「確かめ方」）。
3. **dev 用 OAuth クライアント**（redirect=localhost）＋ `.dev.vars`（`apps/web/.dev.vars.example` 参照）。`PAT_PEPPER` も dev 用に。→ これで OAuth ログインの実ブラウザ一周（縦切りの未検証部分）をローカルで確認できる。
4. **Playwright e2e** で OAuth 込みの一周を自動化（スキル `cloudflare-workers-e2e-playwright`。strict CSP × Vite HMR の罠に注意）。

> `RP_ID` / `ORIGIN` は wrangler.jsonc が本番値、`.dev.vars` が localhost 上書き（設定済み）。

### B. Phase 1 スコープでまだ無い機能（縦切りに含めなかった分）

- **通報チャネル**（クイズ/設問/ユーザ単位・選択肢理由＋自由記述・レート制限 10 件/日/ユーザ）。テーブル＋endpoint＋通報ボタン。公開サービスとして MVP 必須（admin UI は Phase 4）。
- **認証・投稿ルートのレート制限**（現状 `wrangler.jsonc` に `ratelimits` なし）。CT ログ経由のボットスキャンに備える。スキル `cloudflare-workers-bot-scan-defense`。
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

# 本番 OAuth が開通したか（Location を見る）
curl -s -o /dev/null -D - https://mazuoboeru.shiraoka.workers.dev/auth/google | grep -i location
#   accounts.google.com…            → 設定済み（開通）
#   /?auth_error=provider_unconfigured → secret 未投入（未開通）

# 本番のセキュリティヘッダ
curl -s -o /dev/null -D - https://mazuoboeru.shiraoka.workers.dev/ | grep -iE 'content-security-policy|strict-transport'

# PR / CI の状態（public リポなので未認証 REST で読める。gh は未認証では使わない）
curl -s https://api.github.com/repos/okayus/mazuoboeru/commits/main/check-runs
```

---

## 開発の進め方（要点・詳細は CLAUDE.md / ADR-0003）

- **コンテナ内は `claude/*` ブランチへ commit まで**。`git push` は deny、push/PR/merge は **ホスト側リレー**（systemd timer 60 秒）が自動代行。merge を任せるなら **HEAD commit 末尾に `Relay-Merge: yes`**（迷う/影響大は付けず人間 merge）。
- **規約**: TS は関数のみ class なし／採点・正誤判定は必ずサーバー側／UGC は react-markdown + rehype-sanitize（生 HTML 非描画）／公開クエリは常に `status='published' AND deleted_at IS NULL`／秘密はコードに書かず名前参照。
- 本番デプロイは **main マージ → Workers Builds が自動ビルド**（GitHub CI の green は ruleset が強制）。

---

## ハマりどころ / 注意

- **Relay-Merge 空再 merge ループ**: 過去に PR #15〜#22 が同一ツリーの空コミットを量産した（`claude/*` ローカルブランチを消さないと毎 tick 再 merge される）。merge 後はブランチ削除を確認。詳細は自動メモリ `relay-merge-loop-gotcha`。
- **本番 D1 マイグレーション忘れ**: 新しいマイグレーションを足したら本番へ適用しないとテーブル不在で 500。`/api/public/quizzes` の応答で確認できる。
- **`gh` はコンテナ内では未認証で動かない**（ホスト専用）。PR/CI 状態は上記の未認証 `curl` で読む。
- このファイル自身が陳腐化しうる。**矛盾を感じたら §「確かめ方」を実行**し、結果でこのファイルを更新してから進める。
