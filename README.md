# まず覚える (mazuoboeru)

> 学んだことをクイズにして、反復で覚える。作ったクイズはみんなのものになる学習アプリ。

何かを学んだら、それを「問題」にして登録する。アウトプット（クイズ化）が最強のインプット。
**作ったクイズは必ず公開**され、**全ユーザーが他人の作ったクイズに挑戦できる**。
一人の学びが、みんなの学べる教材になる ── 共有された知識のプール。

---

## コンセプト要約

- **作って覚える**: 学習内容をクイズ化することで、受け身でなく能動的に記憶へ定着させる。
- **必ず公開**: 非公開クイズは作れない。自分の学びを共有財にすることが前提。
- **みんなで挑戦**: 他人の良問に挑戦し、自分も問題を提供する。知識のギブ＆テイク。
- **反復で定着**: 間違えた問題を間隔反復（SRS）で復習し、「まず覚える」を支援する。

名前の由来など詳細は [docs/concept.md](docs/concept.md)。

> ⚠️ **kokemusu とは設計思想が対極**。kokemusu は「完全プライベート・各自セルフホスト」。
> mazuoboeru は「**マルチユーザーの公開サービス**（1つの共有サービスを大勢が使う）」。
> このためアカウント認証・モデレーション・UGC（ユーザー生成コンテンツ）の安全な表示が中心課題になる。

---

## ドキュメント

| ファイル | 内容 |
| --- | --- |
| [docs/concept.md](docs/concept.md) | 名前の由来・コンセプト・「必ず公開」の理由 |
| [docs/features.md](docs/features.md) | 機能仕様（クイズ作成・挑戦・復習・発見） |
| [docs/security.md](docs/security.md) | セキュリティ（マルチユーザー・UGC・モデレーション） |
| [docs/tech-stack.md](docs/tech-stack.md) | 技術選定とデプロイ方式 |
| [docs/data-model.md](docs/data-model.md) | データモデル |
| [docs/dev-environment.md](docs/dev-environment.md) | 開発環境コンテナ・Cloudflare認証・デプロイ骨格 |
| [docs/roadmap.md](docs/roadmap.md) | ロードマップ（MVP → 拡張）と「決めること」 |

## ディレクトリ構成（pnpm workspaces）

```
mazuoboeru/
├── docs/              # 企画ドキュメント・ADR
├── apps/
│   ├── web/           # @mazuoboeru/web : React 19 + Vite SPA ＋ Worker（Hono）＋ D1 マイグレーション同梱
│   └── cli/           # @mazuoboeru/cli : CLI / AI エージェント用（ロジック発生時に追加）
└── packages/
    ├── core/          # @mazuoboeru/core : 採点・SRS・集計（純粋関数）（ロジック発生時に追加）
    └── db/            # @mazuoboeru/db   : Drizzle スキーマ & クエリ（ロジック発生時に追加）
```

## ステータス

🌿 **歩く骨格は本番デプロイ済み（`/health` 200・SPA 配信）・Phase 1 の設計確定** ── 主要な「決めること」を `/grill-with-docs` で詰め、
[ADR-0001（認証）](docs/adr/0001-auth-via-oauth-and-pat.md)・
[ADR-0002（公開フロー）](docs/adr/0002-publish-flow-and-edit-rules.md)・
[ADR-0003（シークレット戦略）](docs/adr/0003-secrets-strategy.md)・
[ADR-0004（UGC 描画）](docs/adr/0004-ugc-markdown-rendering.md) を記録。
デプロイは **案A（Cloudflare Workers + D1）** を踏襲し、経路は **Workers Builds（キーレス）**。
本番 URL は `https://mazuoboeru.shiraoka.workers.dev`（workers.dev 運用）。
用語の正典は [CONTEXT.md](CONTEXT.md)、残課題は [docs/roadmap.md](docs/roadmap.md)。
