# 認証は OAuth (Google + GitHub) と PAT で構成、Passkey は MVP に含めない

mazuoboeru は kokemusu と対極の「マルチユーザー公開 SaaS」であり、Web 側は OAuth (Google + GitHub) で認証する。同一 verified email での別プロバイダ初回ログイン時は既存ユーザに自動リンクする。CLI / AI エージェント（Claude 等）が API を叩く経路として PAT (Personal Access Token, Bearer) を Phase 1 に含める。Passkey と Cloudflare Access は MVP には入れず、それぞれ「Phase 2 で Google ログイン後の追加手段」「Phase 4 で `/admin` ゲート」として再評価する。

理由: 公開サービスは onboarding 摩擦が成長の天井になるため、Google ワンクリックを最低摩擦の入口にする。Google + GitHub の IdP に乗ることで anti-abuse と verified email を借り、スパム抑制と本人性のシグナルが得られる。OAuth フローは `arctic`（Lucia 作者・関数志向の薄いライブラリ）だけ採用し、セッション・PAT・middleware は自前実装にすることで [[ts-functions-only-no-class]] と lock-in 最小の方針を保つ。本番ドメインは `mazuoboeru.workers.dev` で固定し、redirect URI は `https://mazuoboeru.workers.dev/auth/callback/{google,github}`、Cookie は `Secure` `HttpOnly` `SameSite=Lax`。

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
- Cookie は `Domain=mazuoboeru.workers.dev`, `Secure`, `HttpOnly`, `SameSite=Lax`（OAuth リダイレクト後の復元のため `Strict` ではなく `Lax`）。
- email は OAuth scope で **必須取得**。display name は初回サインインのプロバイダから取得し、本人が後で編集可能。
