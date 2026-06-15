# サンドボックス内で e2e が完結できる理由（と前提知識）

> **一行**: egress firewall は「実行時だけ」の境界で、`docker build` 中はネット無制限。
> だから **ネットが要るものを“ビルド時”に寄せれば**（ブラウザ等を焼き込めば）、実行時は
> allowlist を増やさずにコンテナ内で e2e が完結する。実行中の e2e は外部に一切出ない
> （被テストは全部ローカル＋唯一の外向き OAuth は seam で迂回）。

## なぜ完結できるのか（5つの事実）

1. **egress firewall = 実行時のみ**。`.docker/init-firewall.sh` はコンテナ起動の entrypoint
   （compose `command`）で iptables/ipset を張る。`docker build` はその前なので **ビルド時の
   ネットは無制限**（Rust/Haskell toolchain・Playwright Chromium・apt deps はここで取得）。
   → ビルド時に取るものは runtime allowlist に足さなくてよい。
2. **e2e の被テストは全部ローカル**。`wrangler dev`（miniflare/workerd）＋ローカル D1（sqlite）
   ＋ビルド成果物の SPA は外部に出ない。コンテナ内で完全に動く（実証済み）。
3. **唯一ネットが要るのはブラウザバイナリの取得**。Playwright の Chromium DL 先 CDN は
   runtime allowlist 外。→ **ビルド時に焼き込む**（`.docker/Dockerfile` `INSTALL_PLAYWRIGHT`、
   `/ms-playwright`）。実行時は DL 不要。
4. **e2e 実行中の通信はブラウザ→`127.0.0.1` のローカル Worker だけ** ＝ **外部 egress ゼロ**。
   だから runtime firewall に触れない。
5. **アプリが唯一外部に出る OAuth（github.com）は seam で迂回**。テストは D1 に `session` 行を
   seed（`id = sha256(token)`、`worker/auth/session.ts` と同一スキーム）し cookie 注入＝本番
   `getSessionUser` を実通過。github.com には行かない。

## 前提知識（これが分かれば腑に落ちる）

- **Docker のビルド時 vs 実行時ネットワーク**: `docker build` のネットは無制限、`docker run`
  起動後は init-firewall.sh の allowlist のみ。「いつネットが要るか」で焼き込み先を決める。
- **egress allowlist の役割**（`.docker/init-firewall.sh`）: runtime に **実際に叩く**
  registry/API だけを通す境界（npm・crates・api.cloudflare.com 等）。ビルド時専用の CDN
  （rustup・ghcup・Playwright）は載せない＝境界を薄く保つ。
- **named volume は再ビルドで消えない**: `claude-config:/home/node/.claude`（認証
  `.credentials.json` 等）は `docker compose down && build && up -d` を跨いで永続。
  → **再ビルドで Claude 再ログインは不要**（`down -v` した時だけ消える）。
- **bind mount = ホストとコンテナが同じファイル**: `./:/workspace`。コンテナ内で作った
  ファイルはホストにも即見える（host への handoff に使える）。
- **okayus-skills は `~/.claude/skills:ro`（読み取り専用・リポ外）**: コンテナからは **書けない**。
  スキルへの還元はホスト作業（handoff md 経由でホストに渡す）。
- **OAuth の自動化限界**: OAuth App の ID/secret は“アプリ”資格。フロー途中の github.com 上の
  ユーザー認証＋Authorize はヘッドレス自動化不可（GitHub が機械ログインを拒否）。だから自動
  e2e は IdP モックか seam を使う。

## ルール（mazuoboeru の規約）

- **ネットが要るのが「ビルド時だけ」のものは Dockerfile に焼き込む**。runtime allowlist は
  「開発中に実際に叩く先」だけに保つ（むやみに広げない）。
- **e2e は被テストをローカルに閉じる**。外部 IdP は seam（seeded session）かモックで迂回し、
  本番コードに認証バイパス（DEV_BYPASS／テスト用ログイン route）を **足さない**。
- **e2e worker は `--ip 127.0.0.1`**（ORIGIN/baseURL も 127.0.0.1）。`localhost` 経路は sandbox の
  IPv4/IPv6 解決で worker が無応答になる（TCP は繋がるが 1 byte も返らない）。
- **ローカルで動かない binding は e2e ビルドから外す**: `unsafe` ratelimit binding は local
  `wrangler dev` で remote 接続しに行き全リクエストがハングする → `apps/web/e2e/prepare-config.ts`
  で strip（fail-open・e2e 対象外）。
- **焼き込む browser と `@playwright/test` は exact pin で一致**。更新時は両方上げて **再ビルド**
  （runtime は CDN 遮断で `playwright install` が効かない）。コンテナ Chromium は `--no-sandbox`
  （`DEVCONTAINER` gate。host は full sandbox 維持）。

## 関連

- 手順とトラップ詳細: `apps/web/e2e/README.md`
- ビルド時焼き込み: `.docker/Dockerfile`（`INSTALL_PLAYWRIGHT`）/ `docker-compose.yml`
- node24 ネイティブ実行: `docs/adr/0005-node24-native-ts-execution.md`
- サンドボックス全体: スキル `claude-code-docker-sandbox`、`.docker/init-firewall.sh`
