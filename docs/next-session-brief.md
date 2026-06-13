# 次セッション引き継ぎブリーフ — Phase 1 最初の縦切りは実装済み（ブランチ）、次はデプロイ前提の人手作業

> ADR-0003 のシークレット戦略は **実働済み**（2026-06-11、Phase A〜C 完了）。
> 基盤・規約は CLAUDE.md と ADR-0003 を正とし再議論しない。
> **2026-06-12: Phase 1 の最初の縦切りを実装し `claude/phase1-vertical-slice` に積んだ**（設計は本セッションの /grill-with-docs で確定＝ADR-0004 ほか）。レビュー & merge と下記「デプロイ前提」が残作業。

## 最初に読むもの
`CLAUDE.md` → `docs/roadmap.md`（Phase 1 のゴール）→ `docs/adr/0001`（認証設計）→ `docs/security.md` → 本ファイル。
基盤の仕組みが必要なときだけ `docs/adr/0003`・`docs/dev-environment.md`。

## いまの状態（What）
- **自律開発基盤 完成・実証済み**: コンテナ内 Claude が `claude/*` ブランチに commit → ホスト側リレー（systemd user timer 60秒、`~/.config/mazuoboeru-relay/`）が GitHub App の 1h トークンで push・PR 化 → CI green → **人間が merge** → Workers Builds が本番デプロイ。PR #1（無人 E2E）で一周検証済み。
- **秘密の所在**: 長命秘密は「GitHub App 秘密鍵（ホスト `~/.config/mazuoboeru-relay/`）」と「Cloudflare 内部のビルドトークン」の 2 つだけ。GitHub Actions Secrets は空、サンドボックス内はゼロ。
- **本番**: https://mazuoboeru.shiraoka.workers.dev （`/health` 200・SPA 配信・D1 マイグレーション適用済み）。
- **コンテナ内規約（最終形）**: `claude/*` へ `git add/commit/checkout/switch` 可・`git push` は deny。push/PR はリレー任せ（手動操作不要）。
- スキル還元済み: okayus-skills に `cloudflare-workers-builds-keyless-deploy`・`sandboxed-agent-git-relay`（okayus-skills 側は未コミット、人間がレビューして commit）。

## Phase 1 縦切りの実装状況（`claude/phase1-vertical-slice`）
**Google/GitHub ログイン → クイズ作成（mcq_single/multi）→ 公開ゲート → 別アカウントで挑戦 → サーバー採点 → 即時フィードバック**、PAT 発行 UI + Bearer も同梱。コミットは機能単位（db→auth→oauth→csrf→pat→quiz→public→attempt→spa）。

- **実装済み**: D1 スキーマ9表＋0001 マイグレーション（CHECK/FK/索引）／セッション（30日スライディング・sha256 保存・host-only Cookie）／OAuth（arctic、検証済みメール限定 auto-link・未検証拒否）／CSRF(Origin)＋CSP/セキュリティヘッダ／PAT（`mzo_pat_`・既定無期限・session 限定発行・scope）／クイズ author CRUD＋公開ゲート（採点可能性をサーバ強制）／公開タイムライン＋挑戦ビュー（答え非開示）／挑戦＋strict 採点（純粋関数）／react-markdown+rehype-sanitize の SPA。
- **検証済み（コンテナ内）**: tsc・vitest 15件（採点/公開ゲート純粋関数）・build。PAT/Bearer での **バックエンド一周**（作成→422/200→タイムライン→挑戦→採点→再回答拒否→CSRF）。SPA HTML が全セキュリティヘッダ付きで配信。DB CHECK が `private` 等を拒否。
- **未検証（人手/後続）**: OAuth ログインの実ブラウザ一周（dev クライアント要）。Playwright e2e（`cloudflare-workers-e2e-playwright`、roadmap 後続）。本番 strict CSP は deploy 後に実 URL で確認。

## デプロイ前提（人手・merge 前後に必要）
1. **本番 Worker Secrets**（`wrangler secret put`、コードは名前参照のみ）: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`/`PAT_PEPPER`。
2. **本番 OAuth クライアント**（Google/GitHub）の redirect URI = `https://mazuoboeru.shiraoka.workers.dev/auth/callback/{google,github}`。
3. **本番 D1 へ 0001 マイグレーション適用**（`wrangler d1 migrations apply mazuoboeru-db --remote`、D1 Edit 権限要）。**これを忘れると本番でテーブル不在のクエリが失敗する**。Workers Builds のビルドコマンドに含めるか手動で。
4. **dev**: dev 専用 OAuth クライアント（redirect=localhost）→ `.dev.vars`（`.dev.vars.example` 参照）。`PAT_PEPPER` も dev 用に。
5. 以後の実スキーマ変更は `cloudflare-d1-drizzle-migration` スキル必読（追加は安全、constraint 変更/table rebuild は要バックアップ）。

## 運用チートシート（基盤）
- リレー状態: `systemctl --user list-timers mazuoboeru-relay.timer` ／ ログ: `journalctl --user -u mazuoboeru-relay.service -f` ／ 手動 1 回: `systemctl --user start mazuoboeru-relay.service`
- リレーが拒否するもの: `claude/*` 外・force push（diverge）・main。マージ済み残骸は差分ゼロでスキップ。
- ビルド状況は GitHub の check run（`Workers Builds: mazuoboeru`）か CF ダッシュボード。

## 次セッションの指示プロンプト（コピペ用）

```text
あなたは mazuoboeru（学習クイズの公開SaaS / Cloudflare Workers + D1 / TypeScript 関数のみ）の開発を引き継ぐ。
まず読む: CLAUDE.md → docs/roadmap.md → docs/adr/0001-auth-via-oauth-and-pat.md → docs/security.md
→ docs/next-session-brief.md。

ゴール: Phase 1 の最初の縦切り「Google ログイン → クイズ作成(mcq_single) → 明示公開 →
別アカウントで挑戦 → サーバー採点 → 即時フィードバック」を、確立済みの自律フローで積み上げる。

進め方:
1. 着手前確認: account subdomain の決定（CLAUDE.md 未決定欄）。OAuth redirect URI / ORIGIN が依存するため先に人間に確認。
2. dev 専用 OAuth クライアントの作成を人間に案内（redirect は localhost のみ。値は .dev.vars へ。本番値は人手で wrangler secret put）。
3. 実装はコンテナ内で claude/* ブランチに段階 commit（push 不要 — ホストのリレーが自動で PR 化する）。
   PR ごとに人間がレビュー & merge。main merge で Workers Builds が自動デプロイ。
4. スキーマ投入は cloudflare-d1-drizzle-migration、レート制限は cloudflare-workers-bot-scan-defense を参照。

規約: TS は関数のみ class なし / 採点はサーバー側 / UGC は react-markdown+rehype-sanitize（生 HTML 非描画）/
公開クエリは status='published' AND deleted_at IS NULL / 秘密はコードに書かず名前参照。
```
