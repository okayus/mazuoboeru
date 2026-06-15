# Node 24 への統一と CLI のネイティブ TypeScript 実行

## Context

`apps/cli`（`@mazuoboeru/cli` — [[PAT]] でクイズを量産する薄い Node スクリプト）は TypeScript で書く（規約: 関数のみ・class 禁止）。だが実行環境の node が分裂していた: **ホスト=24 / サンドボックス（量産する in-container Claude）=20**（`.docker/Dockerfile` の `FROM node:20`）**/ CI=22**（`ci.yml` の `node-version: 22`）。node20 は `.ts` を素で実行できない（ネイティブ type stripping は node ≥22.18、既定有効は 23.6+・24）。CLI を TS のまま走らせる手段として、`tsx` 等のランナー devDep を足す案と、node を上げてネイティブ実行する案があった。

## Decision

3環境すべてを **Node 24 に統一**し、CLI は **`node src/index.ts` でネイティブ実行**する（`tsx` ランナーもビルド段も入れない）。`.docker/Dockerfile` を `FROM node:24` に、`ci.yml` を `node-version: 24` に上げ、既に 24 のホストへ揃える。CLI コードは **erasable-only TypeScript**（class/enum を使わず、型の import は `import type`）に収め、ネイティブ strip の制約を満たす — これは既存リポの規約・コード慣行と一致する。

## Why

- **最も薄い**: ランナー/ビルド/devDep を**足さず**に実行できる。依存を増やすのでなく**減らす**方向で、egress firewall サンドボックス＋供給網最小化の思想（[[0003-secrets-strategy]]）に一致。
- **環境統一**: 20/22/24 の skew を解消（リポが既に「完全一致が要るなら bump（任意）」と認識していた懸案）。ホストが既に 24 なので、サンドボックス/CI をそこへ寄せる動き。
- node24 は現行 LTS。規約「class 禁止・関数のみ」が erasable-only TS を無理なく満たす（native strip の非対応構文＝parameter property 付き class や enum を、そもそも使わない）。

## Consequences

- CLI の実行は **node ≥ 22.18 を要求**（ネイティブ strip）。リポは node24 で統一するため実害はないが、ルート `engines: >=20` とは乖離する（CLI は実質 node24 前提）。
- `.docker/Dockerfile` が `okayus-skills` の `claude-code-docker-sandbox` スキル（Anthropic の node20 devcontainer base の複製）から**乖離**する。スキルへ還元するか本リポ先行かは運用判断（drift を持つ側を意識する）。
- ネイティブ strip は stderr に `ExperimentalWarning: Type Stripping is an experimental feature` を出す（stdout のパイプには無害。必要なら `--disable-warning=ExperimentalWarning` で抑制）。
- 既存 web ツールチェーン（vite6 / wrangler3.x / vitest4）が **node24 で緑**であることを、コンテナ再ビルド＋`pnpm check && test && build` で確認してから確定する。
</content>
</invoke>
