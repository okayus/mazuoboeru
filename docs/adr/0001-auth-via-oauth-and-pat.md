# 認証は OAuth (Google + GitHub) と PAT で構成、Passkey は MVP に含めない

mazuoboeru は kokemusu と対極の「マルチユーザー公開 SaaS」であり、Web 側は OAuth (Google + GitHub) で認証する。同一 verified email での別プロバイダ初回ログイン時は既存ユーザに自動リンクする。CLI / AI エージェント（Claude 等）が API を叩く経路として PAT (Personal Access Token, Bearer) を Phase 1 に含める。Passkey と Cloudflare Access は MVP には入れず、それぞれ「Phase 2 で Google ログイン後の追加手段」「Phase 4 で `/admin` ゲート」として再評価する。

理由: 公開サービスは onboarding 摩擦が成長の天井になるため、Google ワンクリックを最低摩擦の入口にする。Google + GitHub の IdP に乗ることで anti-abuse と verified email を借り、スパム抑制と本人性のシグナルが得られる。OAuth フローは `arctic`（Lucia 作者・関数志向の薄いライブラリ）だけ採用し、セッション・PAT・middleware は自前実装にすることで [[ts-functions-only-no-class]] と lock-in 最小の方針を保つ。本番ドメインは workers.dev 運用で固定し（実 URL は `mazuoboeru.shiraoka.workers.dev`、追記参照）、redirect URI は `https://mazuoboeru.shiraoka.workers.dev/auth/callback/{google,github}`、Cookie は `Secure` `HttpOnly` `SameSite=Lax`。

## Considered Options

- **Passkey only**: kokemusu とコード再利用できるが、公開 SaaS では非技術ユーザの認知コスト、デバイス紛失時の復旧不可、IdP の anti-abuse を借りられないことが重い。
- **Cloudflare Access for end users**: 公開サインアップを扱えないので不可。Phase 4 で `/admin` パスのゲートとして使う候補としては残す。
- **Auth SaaS (Clerk / WorkOS / Auth0)**: DX は高いが、無料枠を超えた後のコスト天井とベンダ lock-in が懸念。
- **Better Auth / Auth.js**: フル機能だが class が多く `ts-functions-only-no-class` 方針と摩擦、また MVP に対し過剰。
- **OAuth Device Authorization Grant for CLI**: UX は良いが PAT より +200 LOC 程度とポーリング endpoint が必要。MVP は PAT で十分、将来 Device Flow を上乗せ可能。

## Consequences

- `oauth_account` テーブルが認証の主。`credential` (Passkey) テーブルは MVP では作らない。`data-model.md` の認証セクションは MVP 時点で `oauth_account` のみとする更新が必要。
- `api_token` テーブルを MVP スキーマに追加する: `id`, `user_id`, `name`, `token_hash`(sha256), `scopes`(JSON), `created_at`, `last_used_at`, `expires_at?`, `revoked_at?`。
- OAuth redirect URI は本番ドメインに紐付くので、将来 custom domain を追加する際は redirect URI を追加登録（既存は維持）。Passkey の RP_ID と違い後戻り可能。
- Cookie は **host-only（`Domain` 属性なし）**・`Secure`・`HttpOnly`・`SameSite=Lax`・`Path=/`、本番は `__Host-` プレフィックス（OAuth リダイレクト後の復元のため `Strict` ではなく `Lax`。当初案からの変更は追記参照）。
- email は OAuth scope で **必須取得**。display name は初回サインインのプロバイダから取得し、本人が後で編集可能。

## 追記

- **2026-06-12 / 本番 URL 改名への追従**: account subdomain 改名（`toshiaki-mukai-9981` → `shiraoka`）により実 URL は `https://mazuoboeru.shiraoka.workers.dev`。設計時表記の `mazuoboeru.workers.dev`（subdomain なし）は workers.dev の構造上存在しない。OAuth クライアント登録前に改名済みのため redirect URI への影響なし。本文の URL は実 URL へ更新済み。
- **2026-06-12 / Cookie を host-only に変更（Phase 1 グリル）**: 当初の `Domain=` 指定を撤回。`shiraoka.workers.dev` 配下には他 Worker（nyalog 等）が同居し、`Domain` 付き Cookie は兄弟サブドメインとの共有・cookie tossing の面を作るため。本番は `__Host-session`（Secure・Domain なし・`Path=/` をブラウザが強制）、dev（`http://localhost:5373`）はプレフィックスなしの `session`。
- **2026-06-12 / セッション実装詳細（Phase 1 グリル）**: セッショントークンは 256bit ランダム値を Cookie にのみ持たせ、DB（`session.id`）には **sha256 ハッシュのみ保存**（PAT の `token_hash` と同じ規律。DB 漏洩でもセッションハイジャック不可）。寿命は **30日スライディング**（アクセスで延長、延長の DB 書き込みは1日1回程度に間引き）。ログアウトは行削除で即失効。
- **2026-06-12 / 自動リンクは「検証済みメール」限定、未検証は拒否（Phase 1 グリル）**: 本文の「同一 verified email は自動リンク」を厳密化する。アカウントのリンク／作成は、**いまログイン中のプロバイダが当該メールを検証済み（Google の `email_verified` / GitHub `/user/emails` の `verified` が `true`）と主張したときのみ**許可する。未検証メールでのログインは**拒否**し、プロバイダ側でのメール検証を案内する（新規アカウントも作らない）。理由: メールだけをリンクキーにすると、攻撃者が被害者のメールを未検証で名乗るだけで既存アカウントへ侵入できる（[[security.md]] の「アカウント乗っ取り」脅威）。Google は常に検証済み、GitHub も大半が検証済みのため実運用の摩擦は小さい。リンクキーとしての email はこの不変条件下でのみ「ユーザ同一性の鍵」たり得る。
- **2026-06-14 / MVP は GitHub のみ・Google は可逆的に保留、passkey は役割再定義のうえ引き続き Phase 2（passkey grill）**: 本文「Web は OAuth (Google + GitHub)」を MVP では **GitHub のみ**に絞る。動機は本プロジェクト固有ではなく作り手のポートフォリオ事情で、**Google Cloud はプロジェクトごとに手動コンソール作業（OAuth クライアント／同意画面の作成・公開）が必要でスケールせず、無料プロジェクト数にも上限がある**。GitHub OAuth App は審査/公開のない一枚フォームのため許容する。Google は将来 redirect URI 追加 + secret 投入で**無痛・可逆に追加可能**（ゆえに新 ADR ではなく本追記）。
  - **トレードオフ**: GitHub-only は事実上**客層を開発者に絞る**（非開発者は GitHub を持たない）ので [[concept.md]] の「一般大衆の知識共有」と緊張する。早期採用者が技術寄り（PAT で AI 量産する層）である点で当面許容し、広い客層が必要になった時点で再評価。
  - **auto-link は前方互換**: 「検証済みメールを鍵に別プロバイダへ自動リンク」は単一プロバイダ下では当面出番が無いが、コードは残し将来 Google 追加時に有効化される。
  - **UI**: Login 画面に Google ボタンを出さない（出すと `provider_unconfigured` リダイレクトになる）。
  - **passkey の役割を再定義**: 「Phase 2 で Google ログイン後の追加手段」→「**Google のコンソール費用なしに、GitHub を持たない非開発者へ客層を広げる console-free な手段**」。MVP には依然含めない。**後から非破壊で追加可能**（`credential` テーブルは additive マイグレーションで安全。既存の GitHub アカウントに認証器を紐づける形なら anti-abuse／復旧の弱点は生じない。弱点が出るのは email 無しの新規アカウントを passkey 単独で作る用途を選んだ場合のみで、その時点で再判断）。
  - **順序制約（不可逆）**: passkey は RP_ID に不可逆ロックするため、**custom domain へ移るなら passkey 実装より前に移行し RP_ID を最終ドメインで確定する**こと。passkey を後回しにした今、この選択肢は保たれている。
