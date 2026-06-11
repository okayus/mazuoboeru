# 次セッション引き継ぎブリーフ — 戦略は確定、残りは「儀式（Phase B）」と「リレー（Phase C）」

> シークレット戦略は調査・合意済みで **ADR-0003 (accepted)** に記録済み（2026-06-11）。
> 次セッションの仕事は実働化。How の細部はその場で決めてよいが、What と境界条件は ADR-0003 を正とし再議論しない。

## 最初に読むもの
`CLAUDE.md` → **`docs/adr/0003-secrets-strategy.md`（核心）** → `docs/dev-environment.md`（セットアップ順） → 本ファイル。
背景が要るときだけ `CONTEXT.md`・`docs/adr/0001`・`0002`・`docs/roadmap.md`。

## いまの状態（What）
- **ADR-0003 accepted**: デプロイ = Workers Builds（キーレス、GitHub Secrets に CF トークンなし）／push・PR = ホスト側リレー + GitHub App（コンテナは commit まで、`claude/*` のみ）／リポ = **public**・main は ruleset 保護（required check = `ci`）／本番アプリ秘密 = Worker Secrets・dev は dev 専用 OAuth クライアント／コンテナ内 `wrangler login` 廃止。
- **Phase A 完了**（2026-06-11）: 設計ドキュメントを `apps/web` 同梱構成に統一（tech-stack / roadmap / README）、`deploy.yml` 廃止 → typecheck+build のみの `ci.yml`、dev-environment のセットアップ順・CLAUDE.md 規約を ADR-0003 に整合。
- 骨格はローカル動作・**未コミット・remote なし**・`database_id` はダミーのまま（**初回 push 前に実値へ**＝skeleton ルール）。
- `.claude/settings.json` の deny（commit/push）は**まだ緩めていない**（リレー稼働後に「push のみ deny」へ）。

## 次にやること（順序が重要）
1. **Phase B（人手・各一度きり）**: `docs/dev-environment.md` セットアップ順 **3〜6** を 1 ステップずつ伴走し完了を検証する（d1 create → public リポ・初回 push・ruleset → GitHub App → Workers Builds 接続）。**トークン類の発行・登録はすべて人手**。エージェントは手順提示・検証・設定値の確認のみ。
2. **Phase C（エージェント）**: ホスト側リレー構築（`claude/*` の新規 commit 検知 → 1h installation token 発行 → push → PR 作成。main・パターン外・force push は拒否）→ 無人 E2E（コンテナ commit → 自動 push → PR → CI green → merge → Workers Builds → 本番 `/health` 200）→ settings.json deny 緩和と CLAUDE.md 規約の最終化 → okayus-skills へ還元（候補名: `cloudflare-workers-builds-keyless-deploy` / `sandboxed-agent-git-relay`）。

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

進め方:
1. Phase B: 人手セレモニー（dev-environment.md セットアップ順 3〜6）を1ステップずつ案内し、
   各ステップの完了を検証する（database_id 反映 → public リポ・ruleset → GitHub App → Workers Builds）。
2. Phase C: ホスト側リレーを構築し、無人 E2E
   「コンテナ commit → 自動 push → PR → CI green → merge → Workers Builds → 本番 /health 200」を通す。
3. 通ったら .claude/settings.json の deny を git push のみへ緩和し、CLAUDE.md の git 規約を最終化、
   確立手順を okayus-skills に還元する。

制約:
- トークン・鍵の発行/登録は必ず人手（エージェントは手順提示と検証のみ。勝手に発行・登録しない）。
- ADR-0003 の決定事項は再議論しない。TS は関数のみ class なし。
- Claude Code の機能で不明な点は code.claude.com/docs を WebFetch して確認する。
```
