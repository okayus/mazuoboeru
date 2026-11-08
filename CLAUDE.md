# まず覚える (mazuoboeru)

学んだことをクイズにして反復で覚える学習 Web アプリ。クイズは必ず公開され、誰でも他人のクイズに挑戦できる。kokemusu（1 人用・各自セルフホスト）と違い、1 つの共有デプロイを大勢が使う公開サービスなので、UGC の安全な表示とモデレーションが中心の課題になる。用語は `CONTEXT.md`、決定は `docs/adr/`、セキュリティは `docs/security.md`（最重要）、現況とロードマップは `docs/project-status.md`。

## 進め方

- 新機能・フェーズ・計画の相談では、`docs/project-status.md` を読んで現在地の要約と候補の方針 2〜3 個（それぞれのトレードオフを一言）を示し、方針の指示を待つ。status を読んだことは着手の許可ではない。方針が決まったら `/grill-with-docs` で `CONTEXT.md` と ADR に突き合わせ、用語は `CONTEXT.md`、後戻りしにくい決定は ADR に書いてから計画と実装に進む。status の質問や merge などの運用はこの限りでない。
- `docs/project-status.md` は長い。見出しから要る節だけ読む。記述は遅れるので、本番の状態は同ファイルの「現況の確かめ方」で確かめる。

## 確定済みの決定（根拠は ADR）

- クイズは必ず公開する（非公開の選択肢を作らない。ADR-0002）。公開するのはクイズ本体だけで、学習履歴・成績・メールアドレスは本人以外に見せない。
- 採点と正誤判定はサーバーで行う。理由は正誤の単一の真実と回答後の解説の開示で、不正防止ではない（ランキングも公開スコアも無い。ADR-0010）。
- 他人のクイズは react-markdown + rehype-sanitize で描画し、生の HTML は描画しない（ADR-0004。`dangerouslySetInnerHTML` と `rehype-raw` は lint も止める）。
- デプロイは Workers Builds（キーレス）で、GitHub に Cloudflare の資格情報を置かない。コンテナで `wrangler login` しない。`main` は ruleset（PR 必須・required check `ci`・bypass なし）。リポは public で、秘密・`.dev.vars`・`.docker/sandbox.env`・本番 D1 の dump はコミットしない（ADR-0003）。
- 本番 URL は `https://mazuoboeru.shiraoka.workers.dev`（subdomain の無い URL は存在しない）。
- kokemusu への日次ダイジェスト（ADR-0017）は Service Binding `KOKEMUSU` で送る（同じ workers.dev の Worker へは global `fetch()` が届かない）。受け側の契約は転記せず、vendoring した `apps/web/worker/domain/kokemusu-posts.schema.json` を読む（更新は `apps/web` で `pnpm kokemusu:schema`）。

## コマンドと罠

- pnpm はコンテナで走らせる。ルートで `pnpm dev --host`（コンテナ 5173 → ホスト 5373。`--host` が無いとホストから届かない）、`pnpm check`、`pnpm build`。CI と同じ検査（全パッケージの型・lint・format・build・test）は `pnpm run ci`（`pnpm ci` は pnpm 本体の別コマンドになる）。e2e は `pnpm e2e`（CI は走らせない。`apps/web/e2e/README.md`）。
- lint と format はパッケージごとに `pnpm --filter @mazuoboeru/web lint`（`fmt`・`fmt:check` も同じ形。vp はパッケージのディレクトリで動かす）。
- ホストで開いたセッションでは、編集と git はホストで行い、pnpm はコンテナに投げる（起動は `./up.sh`、実行は `docker exec mazuoboeru-dev pnpm run ci`）。`./up.sh` の直後は pnpm の入れ直しが終わっていないので、`docker exec mazuoboeru-dev pnpm --version` が通るまで待つ。`node_modules` がずれていれば、先にコンテナで `pnpm install --frozen-lockfile`。
- ホストで pnpm・npx・node のパッケージスクリプトを走らせない。依存のコードが隔離の外で動き、作業ツリーを共有するコンテナの `node_modules` も壊れる。CLI の npm publish だけは持ち主がホストで手で行う（`docs/dev-environment.md`）。
- ローカルの変数は `apps/web/.dev.vars`（`.dev.vars.example` をコピーする）。
- API ルートは Hono のメソッドチェーンで定義する。別々の文で書くと型が route に乗らず、クライアントの `hc<AppType>` の推論が壊れる（ADR-0011）。
- migration（`apps/web/drizzle/`）は main への merge で本番 D1 に適用される（Workers Builds の deploy command が `wrangler d1 migrations apply --remote` を deploy の前に走らせる。手で当てない）。書く前に okayus-skills の skill `cloudflare-d1-drizzle-migration` を読む。
- 本番に載ったかは、main の commit の check-run `Workers Builds: mazuoboeru` が success かで確かめる（`curl -s https://api.github.com/repos/okayus/mazuoboeru/commits/<sha>/check-runs`、認証なし）。`docs/` と `*.md` だけの commit ではビルドが走らない。

## 書き方

- TypeScript は関数だけで書き、`class` を使わない。ドメインロジックは純粋関数に寄せ、I/O は境界に置く。
- API は記憶で断定せず、公式 docs で確かめる（`cloudflare-docs` MCP、各サイトの `/llms.txt`）。コンテナの firewall は allowlist 外の URL を通さない。Claude Code 自体の機能・設定は https://code.claude.com/docs/llms.txt で確かめる。

## git と merge

- `claude/<topic>` に commit し、push して `gh pr create` する。PR の題は Conventional Commits で書く（commit が 2 つ以上だと `--fill` の題がブランチ名になる）。PR 本文の修正は `gh pr comment` で行う（`gh pr edit` はコンテナの古い gh で落ちる）。PR と CI の状態は `gh pr view` と `gh pr checks` で見る。
- CI が green になったのを確かめたら、`gh pr merge --auto --squash <PR番号>` で arm してよい（`--auto` は required check `ci` が通るまで merge を待たせる）。コンテナの gh（2.23）は、green で clean な PR への `--auto` を「Pull request is in clean status」で弾く。そのときだけ `gh pr merge --squash <PR番号>` を使う（hook が clean を確かめる）。それ以外の `--auto` なしの merge と `--admin` は使わない。
- `apps/web/drizzle/`、`.github/**`、`.claude/**`、`docs/adr/**` を触る PR と、迷う変更・影響の大きい変更は、自分から arm しない。持ち主が差分を見たうえで merge を頼んだときだけ arm する（PR ができる前の「merge まで進めて」は含まない）。
- migration の PR はさらに、merge の直前（24 時間以内）に持ち主がホストで `node ~/.config/d1-backup/d1-bookmark.mjs mazuoboeru <PR番号>` を実行し、D1 Time Travel の bookmark を PR にコメントするまで arm しない（コンテナには Cloudflare の資格情報がない）。bookmark のコメントは持ち主がこのコマンドで付けるもので、自分では投稿しない。
- 既存行の書き換え・テーブルの再構築・DROP を含む migration なら、戻し方を書く（PR を作るときは本文に、作った後なら `gh pr comment` で）。
- merge の形と migration PR の bookmark は PreToolUse hook `guard-pr-merge.sh` が、リモートブランチを消す push は `guard-push-delete.sh` が止める。止められたら理由に従い、別の形で回避しない。
- token は印字しない・URL に埋めない・`gh auth` 系は使わない。コンテナでは token は `./shell.sh` が開いたシェルにだけある。`git push` が 401 なら token の無いシェルなので、持ち主に `./shell.sh` を開いてもらう（回避しない）。ホストでは持ち主の gh の認証で push と PR 操作ができる。
- `.github/workflows/**` はコンテナの token では push できない（workflows 権限がない）。CI の中身は `package.json` の `ci` script と `.node-version` で変えられる。
