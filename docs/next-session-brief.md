# 次セッション引き継ぎブリーフ — 戦略は確定、残りは「儀式（Phase B）」と「リレー（Phase C）」

> シークレット戦略は調査・合意済みで **ADR-0003 (accepted)** に記録済み（2026-06-11）。
> 次セッションの仕事は実働化。How の細部はその場で決めてよいが、What と境界条件は ADR-0003 を正とし再議論しない。

## 最初に読むもの
`CLAUDE.md` → **`docs/adr/0003-secrets-strategy.md`（核心）** → `docs/dev-environment.md`（セットアップ順） → 本ファイル。
背景が要るときだけ `CONTEXT.md`・`docs/adr/0001`・`0002`・`docs/roadmap.md`。

## いまの状態（What）
- **ADR-0003 accepted**: デプロイ = Workers Builds（キーレス、GitHub Secrets に CF トークンなし）／push・PR = ホスト側リレー + GitHub App（コンテナは commit まで、`claude/*` のみ）／リポ = **public**・main は ruleset 保護（required check = `ci`）／本番アプリ秘密 = Worker Secrets・dev は dev 専用 OAuth クライアント／コンテナ内 `wrangler login` 廃止。
- **Phase A 完了**（2026-06-11）: 設計ドキュメントを `apps/web` 同梱構成に統一（tech-stack / roadmap / README）、`deploy.yml` 廃止 → typecheck+build のみの `ci.yml`、dev-environment のセットアップ順・CLAUDE.md 規約を ADR-0003 に整合。
- **Phase B 完了**（2026-06-11）: リポ https://github.com/okayus/mazuoboeru（public・main ruleset: PR 必須 + required check `ci`・force push 禁止・bypass なし）／ D1 `mazuoboeru-db`（`database_id` 反映済み）／ GitHub App `mazuoboeru-relay`（App ID 4024233・Installation ID 139504528・秘密鍵と設定はホストの `~/.config/mazuoboeru-relay/`、コンテナ非マウント）／ Workers Builds 接続（root `apps/web`・build/deploy command・D1 Edit 入りカスタムトークン）→ **本番 `/health` 200**。
- 本番実 URL は **`mazuoboeru.toshiaki-mukai-9981.workers.dev`**（account subdomain 由来。subdomain を変えるなら Phase 1 の OAuth/RP_ID 固定前。CLAUDE.md 未決定欄参照）。
- Phase B 完了を反映したドキュメント更新（CLAUDE.md・本ファイル）は**未コミットの working tree 変更**として意図的に残してある → **Phase C リレー E2E の初荷**（`claude/*` ブランチ → PR）にする。
- `.claude/settings.json` の deny（commit/push）は**まだ緩めていない**（リレー稼働後に「push のみ deny」へ）。

## 次にやること
**Phase C（エージェント）**: ホスト側リレー構築（`claude/*` の新規 commit 検知 → 1h installation token 発行 → push → PR 作成。main・パターン外・force push は拒否。設定は `~/.config/mazuoboeru-relay/config.env`）→ 無人 E2E（コンテナ commit → 自動 push → PR → CI green → merge → Workers Builds → 本番 `/health` 200。初荷は上記の未コミットのドキュメント更新）→ settings.json deny 緩和と CLAUDE.md 規約の最終化 → okayus-skills へ還元（候補名: `cloudflare-workers-builds-keyless-deploy` / `sandboxed-agent-git-relay`）。

## 再議論しないこと（ADR-0003 で確定済み）
- 「キーレスで消す ＞ 秘密管理基盤から注入」の優先。平文クレデンシャルをサンドボックスに入れない。
- preview（非本番ブランチ）ビルドは当面オフ。D1 マイグレーションは本番 deploy command のみ（preview は本番 D1 を共有するため）。
- Workers Builds のビルドトークンはデフォルトで D1 Edit を欠く → カスタムトークンを CF の Build 設定に登録（GitHub には置かない）。
- リポ構成は `apps/web` 同梱（`server/` は作らない）。

---

## 次セッションの指示プロンプト（コピペ用）

```text
あなたは mazuoboeru（学習クイズの公開SaaS / Cloudflare Workers + D1 / TypeScript 関数のみ）の開発を引き継ぐ。
まず読む: CLAUDE.md → docs/adr/0003-secrets-strategy.md → docs/dev-environment.md → docs/next-session-brief.md。

ゴール: ADR-0003 のシークレット戦略を実働させ、「コンテナ内 Claude が 計画→実装→test/lint→PR を
自律で回し、main には直接触れない」基盤を完成させる。

進め方（Phase B は完了済み。リレーの設定は ~/.config/mazuoboeru-relay/config.env と app.pem）:
1. ホスト側リレーを構築し、無人 E2E
   「コンテナ commit → 自動 push → PR → CI green → merge → Workers Builds → 本番 /health 200」を通す。
   E2E の初荷は working tree に残してある Phase B 完了のドキュメント更新（claude/* ブランチに乗せる）。
2. 通ったら .claude/settings.json の deny を git push のみへ緩和し、CLAUDE.md の git 規約を最終化、
   確立手順を okayus-skills に還元する。

制約:
- トークン・鍵の発行/登録は必ず人手（エージェントは手順提示と検証のみ。勝手に発行・登録しない）。
- ADR-0003 の決定事項は再議論しない。TS は関数のみ class なし。
- Claude Code の機能で不明な点は code.claude.com/docs を WebFetch して確認する。
```
