# CLI を npm 配信する — ホスト手動 publish ＋ vp pack ビルド

`@mazuoboeru/cli`（`mzo`）を npm の public パッケージとして配信する（`npx @mazuoboeru/cli` / `npm i -g` 可）。
publish は **ホスト手動 `pnpm publish`**（npm 資格情報はホストのみ＝[ADR-0003](0003-secrets-strategy.md) の secret-zero を npm にも適用）、
ビルドは **`vp pack`**（vite-plus 同梱 tsdown・[ADR-0009](0009-vite-plus-toolchain.md) の「build も vp へ」を CLI で前進）。
リポ全体を **MIT** 化（npm 公開の法的前提）。（2026-07-13 決定・grill 済み）

## Context

- `mzo` は node24 のネイティブ TS 実行（[ADR-0005](0005-node24-native-ts-execution.md)）で `bin` が `./src/index.ts` 直指し・`private: true` だった。**node は `node_modules` 配下の `.ts` を type stripping しない**ため、`.ts` のまま publish しても `npx` では動かない＝配布にはビルドが要る。
- npm トークンをサンドボックス/CI に置けない（[ADR-0003](0003-secrets-strategy.md)。Cloudflare トークンを GitHub Secrets に置かないために Workers Builds を選んだのと同じ制約が npm にも当てはまる）。keyless CI デプロイの前例があるので「なぜ publish だけ手動？」が将来疑問になる＝本 ADR が理由を残す。
- 当初計画（project-status）の esbuild は世代交代が進行（TypeScript 7 GA・Rolldown/tsdown の成熟）。かつ本リポは vite-plus を本採用済み（ADR-0009）で、`vp pack`＝tsdown が root devDep に**同梱済み**。
- リポには LICENSE が無かった（public でも法的には all rights reserved）＝npm 公開の前提欠落。
- npm の `mzo`（unscoped）は未取得だったが、リポ規約はパッケージ名 `@mazuoboeru/*`。

## Decision

1. **配布**: `@mazuoboeru/cli` を npm public で配信（npm org `mazuoboeru`・`publishConfig.access=public`・`files=["dist"]`・`bin.mzo=./dist/index.mjs`・engines `>=22.18` 据え置き）。リポ全体を **MIT**（root と `apps/cli` に LICENSE・名義 okayus）。
2. **publish 経路**: **ホスト手動 `pnpm -C apps/cli publish`**。npm ログインはホストだけが持つ。`prepublishOnly` = `check && lint && test && build` の全ゲートで「publish される dist は常に検査済み・ビルド直後」を機械保証。手順は [dev-environment.md](../dev-environment.md) §CLI の npm リリース。
3. **ビルド**: `vp pack src/index.ts`（tsdown）。単一 ESM `dist/index.mjs`（実測 15kB/36ms）・shebang 保持＋実行権限自動付与・target は engines から自動導出・package.json の JSON import は**ビルド時インライン＋treeshake**（version のみ焼き込み）。設定ファイル・ソース変更ゼロ。
4. **バージョニング**: `0.1.0` 開始。bump は通常 PR で `version` を編集（コンテナ内エージェント可）。**git タグは打たない**（version→commit は bump コミット・version→日時は registry が記録）。二重 publish は registry の同一 version 拒否が構造的ガード＝「publish が落ちる＝bump し忘れ」。

## Considered Options

- **publish 経路**
  - **npm Trusted Publishing（OIDC）+ GitHub Actions**: keyless・provenance 付きで ADR-0003 の思想に最も近い。ただし npmjs 側セレモニー（org＋trusted publisher 設定）に加えて新規パッケージの初回 publish 可否に不確実性があり、低頻度リリースの薄い CLI には当面過剰。**可逆＝後日移行可**（再開条件: リリース頻度が上がる／provenance が求められる）。
  - **granular npm トークンを GitHub Secrets に置いて Actions publish**: 長寿命トークンを GH Secrets に置くのは「CF トークンを置かない」と決めた ADR-0003 と正面衝突＝却下。
  - **ホスト手動（採用）**: wrangler ログインと同型「特権操作はホスト」。セレモニー最小・秘密の置き場所を増やさない。
- **ビルドツール**（いずれも spike 実測で比較）
  - **esbuild**: 実績はあるが新規 devDep 追加で、Rolldown/tsdown 世代への交代が進む中あえて選ぶ理由がない。
  - **tsgo（TypeScript 7 native tsc）で emit**: TS 7.0.2 GA・emit 自体は 0.25s で成立（shebang 保持・`.ts`→`.js` rewrite 可）。ただし `../package.json` の JSON import が **rootDir をパッケージルートへ引き上げ、`dist/package.json`（ビルド時コピー）が配布物に混入**する。回避にはソース改変（createRequire 化等）が要り、apps/cli だけ TS 7 に上げると TS 版分裂（ADR-0009 が嫌った構図）も招く。**TS 7 化は workspace 全体の typecheck 更新という別タスク**が筋。
  - **`vp pack`（採用）**: 追加依存ゼロ（vite-plus 同梱）・設定/ソース変更ゼロで完動・ADR-0009 の方向と一致。
- **パッケージ名**: unscoped `mzo`（空きは確認済み・`npx mzo` が短い）も可能だったが、リポ規約 `@mazuoboeru/*` との一致と出自の分かりやすさで scoped を採用（インストール後のコマンド名はどちらでも `mzo`）。

## Why

- **秘密の置き場所を増やさない**が最優先（ADR-0003 の一貫）。リリース頻度が低い CLI に自動化の固定費は見合わない。
- `prepublishOnly` 全ゲート＋registry の重複拒否で、手動運用でも「未検査の dist」「bump し忘れの上書き」が**構造的に**起きない。
- `vp pack` はゼロ設定で要件（単一 ESM・shebang・version 焼き込み）を満たし、ツールチェインを増やさない。

## Consequences

- ホストの npm ログインが唯一の資格情報保持点（初回セレモニー: org `mazuoboeru` 作成→`npm login`。org 名が取られていた場合は名前を再相談）。
- provenance は付かない（Trusted Publishing 移行で解決可＝上記再開条件）。
- `mzo --version` は配布物＝ビルド時焼き込み／リポ内 src 直実行＝ランタイム参照の二系統だが、publish 直前ビルドの強制でズレる経路がない。
- `vp pack --publint` は publint 本体が vite-plus 非同梱（要 devDep）のため見送り。tarball 検査（`pnpm pack`）と install スモークで代替した。
- CI は publish に関与しない（`prepublishOnly` はホストの publish 時のみ走る）。workspace 内の `bin` が `dist/` 指しになるため、ビルド前は bin リンクが空振りするが、dev は従来どおり `node src/index.ts`（`pnpm mzo`）で src を直実行する。
- TypeScript 7（tsgo）への workspace typecheck 更新は独立の実装候補として project-status に積む。
