# 次セッション引き継ぎブリーフ — 自律開発基盤は完成、次は Phase 1（最初の縦切り）

> ADR-0003 のシークレット戦略は **実働済み**（2026-06-11、Phase A〜C 完了）。
> 次セッションの仕事はアプリ本体＝Phase 1。基盤・規約は CLAUDE.md と ADR-0003 を正とし再議論しない。

## 最初に読むもの
`CLAUDE.md` → `docs/roadmap.md`（Phase 1 のゴール）→ `docs/adr/0001`（認証設計）→ `docs/security.md` → 本ファイル。
基盤の仕組みが必要なときだけ `docs/adr/0003`・`docs/dev-environment.md`。

## いまの状態（What）
- **自律開発基盤 完成・実証済み**: コンテナ内 Claude が `claude/*` ブランチに commit → ホスト側リレー（systemd user timer 60秒、`~/.config/mazuoboeru-relay/`）が GitHub App の 1h トークンで push・PR 化 → CI green → **人間が merge** → Workers Builds が本番デプロイ。PR #1（無人 E2E）で一周検証済み。
- **秘密の所在**: 長命秘密は「GitHub App 秘密鍵（ホスト `~/.config/mazuoboeru-relay/`）」と「Cloudflare 内部のビルドトークン」の 2 つだけ。GitHub Actions Secrets は空、サンドボックス内はゼロ。
- **本番**: https://mazuoboeru.shiraoka.workers.dev （`/health` 200・SPA 配信・D1 マイグレーション適用済み）。
- **コンテナ内規約（最終形）**: `claude/*` へ `git add/commit/checkout/switch` 可・`git push` は deny。push/PR はリレー任せ（手動操作不要）。
- スキル還元済み: okayus-skills に `cloudflare-workers-builds-keyless-deploy`・`sandboxed-agent-git-relay`（okayus-skills 側は未コミット、人間がレビューして commit）。

## 次にやること — Phase 1（`docs/roadmap.md`）
最初の縦切り: **Google ログイン → クイズ作成（mcq_single）→ 明示公開 → 別アカウントで挑戦 → サーバー採点 → 即時フィードバック**。PAT 発行 UI + Bearer middleware も縦切りに同梱。

着手前の確定事項（人手が絡む順に）:
1. **account subdomain の確定**（CLAUDE.md 未決定欄）— OAuth redirect URI と ORIGIN が依存。改名するなら他サービスへの影響確認のうえ先に。
2. **dev 専用 OAuth クライアント作成**（Google/GitHub、redirect = localhost のみ）→ `.dev.vars` へ（ADR-0003 の 2 層ルール: 本番値は `wrangler secret put`、サンドボックスには dev 層のみ）。
3. 実スキーマ投入時は `cloudflare-d1-drizzle-migration` スキル必読。

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

規約: TS は関数のみ class なし / 採点はサーバー側 / UGC はサニタイズ（DOMPurify）/
公開クエリは status='published' AND deleted_at IS NULL / 秘密はコードに書かず名前参照。
```
