# ツールチェインに vite-plus（VoidZero 統合）を本採用 — 段階導入

リンタ/フォーマッタ/テスト/（将来）ビルドを **vite-plus**（VoidZero の統合ツールチェイン・Oxlint/oxfmt/vitest/Rolldown を内包）に寄せる。第一段階として lint(`vp lint`)・fmt(`vp fmt`)・test(`vp test`) を採用し、**テストは vite-plus 同梱 vitest に一本化**（個別 `vitest` devDep を撤去）。dev/build（Rolldown）への移行は `@cloudflare/vite-plugin` の互換検証＋wrangler v4 とセットの別タスク。（2026-06-18 決定。リンタ導入の検討中に「統合ツールチェイン本採用」へ拡張。）

## Context

- `vite-plus`（`viteplus.dev`・maintainers に Evan You / Boshen 等＝VoidZero 公式・npm の provenance 確認済み）をリンタとして導入する過程で、単なるリンタではなく**統合ツールチェインとして本採用**する判断に至った。
- vite-plus は **Oxlint（lint）・oxfmt（fmt）・vitest（test）・Rolldown（bundle）** を `vp` CLI 配下に束ねる（`vp test` は同梱 vitest そのもの）。
- 既存スタックは vanilla Vite 6 + 個別 vitest + `@cloudflare/vite-plugin`（SPA+Worker を1 Worker に束ねる**必須**プラグイン・wrangler 3.x とペア）。
- ライセンス通信なし（確認済み）・npm 配布＝サンドボックス（egress firewall）内でインストール/実行が完結する（registry.npmjs.org 許可済み）。
- きっかけ: vite-plus 追加で vitest が 4.1.8（apps）/4.1.9（vite-plus）に分裂し、版管理の分散が顕在化した。

## Decision

**vite-plus をプロジェクトのツールチェインとして本採用する。ただし結合度で段階導入する。**

- **段1（採用・低リスク）**: lint=`vp lint`（Oxlint）、fmt=`vp fmt`（oxfmt）、test=`vp test`（vitest）。
  - **テストは vite-plus 同梱 vitest に一本化**。apps/web・apps/cli の個別 `vitest` devDep を撤去し、`test` スクリプトを `vp test run` に。
  - vitest の版を**単一**にする: root に `vitest` を vite-plus 同梱版と同一の **`4.1.9`（exact）で固定**。理由は apps/web の `vitest.config.ts` の `import "vitest/config"` を Node の walk-up で解決させるため（root 1 箇所宣言）。vite-plus が vitest を上げたら root も追従する。
- **段2（保留・要検証・wrangler v4 と連動）**: dev=`vp dev` / build=`vp build`（Rolldown）。
  - **`@cloudflare/vite-plugin` が vite-plus/Rolldown 上で動くか未検証**。おそらく `@cloudflare/vite-plugin` 1.x ＋ wrangler 4 が前提＝wrangler v4 移行（別タスク）と同一作業。
  - **ドロップイン前提にせず、本番デプロイ（Workers Builds）＋ e2e（Playwright）を通して検証**してから切り替える。それまで dev/build は現行（vanilla Vite 6 + `vite build` + `@cloudflare/vite-plugin` 0.1.x + wrangler 3.x）を維持。
- 配線（vite-plus 設定ファイル・`lint`/`fmt` スクリプト・CI への組み込み）は実装セッションで行う。

## Considered Options

- **標準スタック維持（ESLint/Biome + vanilla Vite/Rollup + vitest 個別）**: 成熟・枯れているが、lint/fmt/test/build が別々で版管理が分散（実際に vitest 版が分裂した）。
- **vite-plus 本採用・段階導入（採用）**: lint/fmt/test を1ツールに統合し版を単一化。dev/build は互換検証後に段階移行＝リスクを切り分け。
- **vite-plus をリンタのみで使う**: Oxlint 単体の方が軽量で、リンタだけなら vite-plus は過剰（vitest/browser-preview/react コピーまで引く）。だが test/build も寄せる前提なら統合の価値が勝る（本採用を選択）。

## Why

- lint+fmt+test（+将来 build）が単一ツール・単一版で揃い、**版管理の分散（vitest 分裂など）が構造的に消える**。
- Oxlint/oxfmt/Rolldown は Rust 製で高速。
- サンドボックス完結（npm 配布・ライセンス通信なし）でコンテナ開発フローを壊さない。
- 結合度の高い dev/build を切り離して段階導入することで、**必須の `@cloudflare/vite-plugin` を壊すリスクを本番/e2e 検証まで遅延**できる。

## Consequences

- apps の個別 `vitest` devDep を撤去、`test`=`vp test run`、root に `vitest@4.1.9`（exact）を単一宣言（vite-plus 同梱版と同期）。テストは緑（apps/web 54 / apps/cli 26・実機確認）。
- vite-plus は若い 0.x 製品で更新が速い（0.2.0→0.2.1 が1日）。**root の vitest 固定版は vite-plus の同梱 vitest と手動同期**が要る（ずれると再分裂）。`vp` の破壊的変更にも追随が要る。
- dev/build は当面 vanilla Vite 6 + `@cloudflare/vite-plugin` 0.1.x + wrangler 3.x のまま。段2は wrangler v4 移行とセットの別ブランチ（デプロイ＋e2e 検証込み）。
- `@playwright/test` の exact pin（焼き込み Chromium と一致＝e2e スキル規約）・pnpm の pin は従来どおり（vite-plus とは独立）。
- lint/fmt のルール・CI 組み込みは実装セッションで確定（本 ADR では「採用」と段階方針のみ）。
