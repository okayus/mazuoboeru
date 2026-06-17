# データモデル

Cloudflare D1（SQLite）前提。マルチユーザーの公開サービス。
クイズは公開、個人の成績・SRS は本人のみ。採点はサーバー権威。

## エンティティ概観

```
user 1───* oauth_account   (認証手段: Google / GitHub)
user 1───* api_token       (PAT: CLI / AI エージェント用)
user 1───* session         (Cookie ベースの Web 認証状態)
user 1───* quiz            (作者)
quiz 1───* question
question 1───* choice      (多肢選択の選択肢)
quiz *───* tag             (quiz_tags)
user 1───* attempt         (挑戦)
attempt 1───* attempt_answer
user *───* quiz            (favorite で多対多)
user 1───* review_state    (SRS, 設問ごと)
user 1───* report          (通報)
```

> ⚠️ MVP では `credential`（Passkey/WebAuthn）テーブルは作らない（[ADR-0001](adr/0001-auth-via-oauth-and-pat.md)）。Phase 2 で追加検討。

## テーブル定義（案）

### user
| カラム | 型 | 備考 |
| --- | --- | --- |
| id | text (uuid) | PK |
| display_name | text | **公開**。一意推奨 |
| email | text? | **非公開** PII。OAuth/通知用 |
| role | text | `user` / `moderator` / `admin` |
| created_at | integer | epoch ms |
| status | text | `active` / `suspended`（モデレーション） |

### oauth_account（MVP の認証手段）
| カラム | 型 | 備考 |
| --- | --- | --- |
| provider | text | `google` / `github` |
| provider_account_id | text | IdP 側の安定 ID（email ではなく sub / id） |
| user_id | text | FK → user |
| created_at | integer | |
|  |  | PK = (provider, provider_account_id) |

- 同一 verified email で別プロバイダから初回ログインしたら、**既存 user に自動リンク**（[ADR-0001](adr/0001-auth-via-oauth-and-pat.md)）。
- email scope は **必須**。`user.email` は初回サインインで取得して保存、以降変更可。

### api_token（PAT: CLI / AI エージェント用）
| カラム | 型 | 備考 |
| --- | --- | --- |
| id | text | PK（公開可、トークン本体ではない） |
| user_id | text | FK → user |
| name | text | ユーザがつけたラベル（例: "claude-laptop"） |
| token_hash | text | sha256(token + project pepper)。**平文は保存しない**。発行直後にだけ画面表示 |
| scopes | text (JSON) | 例: `["quiz:write","quiz:read"]`。MVP は固定セット |
| created_at | integer | |
| last_used_at | integer? | |
| expires_at | integer? | 任意の期限 |
| revoked_at | integer? | 失効時刻（NULL なら有効） |

- 認証ミドルウェアは `Authorization: Bearer <token>` を受け、`token_hash` 一致＋ `revoked_at IS NULL` ＋ `expires_at` 未経過で通す。
- 失効/ローテーションは Web 設定画面から実施。
- **トークン形式（2026-06-12 グリル確定）**: `mzo_pat_<base64url(32 ランダムバイト)>`。先頭の `mzo_pat_` プレフィックスで secret scanning（GitHub push protection 等）が検出でき、ログ上の識別も容易。`token_hash = sha256(token + pepper)`、**pepper は Worker Secret**（コードに置かない）。平文は発行直後の画面表示のみ。**既定は無期限**（`expires_at` は任意。AI エージェントの常用・量産向け）で、失効はいつでも設定画面から（`revoked_at`）。`scopes` は MVP 固定セット `["quiz:read","quiz:write"]`。

### credential（Passkey, Phase 2 候補）
- MVP では作らない。Phase 2 で Google ログイン後の追加導線として再評価する場合、kokemusu と同形（`id` / `user_id` / `public_key` / `counter` / `transports` / `label` / `created_at`）で導入。

### session
| カラム | 型 | 備考 |
| --- | --- | --- |
| id | text | PK（Cookie 格納） |
| user_id | text | FK |
| expires_at | integer | |
| created_at / last_seen_at | integer | アイドルタイムアウト |

### quiz（必ず公開）
| カラム | 型 | 備考 |
| --- | --- | --- |
| id | text (uuid) | PK |
| author_id | text | FK → user |
| title | text | |
| description | text? | Markdown（表示時サニタイズ） |
| status | text | CHECK 制約で `draft` / `published` / `hidden` の3値固定 |
| created_at / updated_at | integer | |
| published_at | integer? | 初回 `published` 遷移時刻 |
| deleted_at | integer? | ソフトデリート |

> 「必ず公開」= 非公開オプションなし。`status` は `draft` → `published` の **不可逆遷移**、違反時のみモデレータが `hidden` に。`private` は持たない。公開クエリは常に `status='published' AND deleted_at IS NULL` で絞る（[ADR-0002](adr/0002-publish-flow-and-edit-rules.md)）。

### question
| カラム | 型 | 備考 |
| --- | --- | --- |
| id | text | PK |
| quiz_id | text | FK → quiz |
| type | text | **MVP は `mcq_single` / `mcq_multi` のみ**。`boolean` / `short` / `cloze` は Phase 2 候補 |
| prompt | text | 設問文（Markdown、サニタイズ） |
| explanation | text? | 解説（**採点後に開示**） |
| answer | text? | Phase 2 で `short`/`cloze` を入れる時に使用（正規化ルールつき）。MVP では未使用 |
| position | integer | 並び順 |

### choice（多肢選択の選択肢）
| カラム | 型 | 備考 |
| --- | --- | --- |
| id | text | PK |
| question_id | text | FK |
| text | text | 選択肢文 |
| is_correct | integer (bool) | **クライアントに挑戦前は渡さない** |
| position | integer | |

### tag / quiz_tags / tag_edge
- tag: `id` / `name`（表示名）/ `name_key`（識別キー＝NFKC・trim・空白畳み・小文字。**一意**）/ `created_at`。"Docker"/"docker" は1タグに統合し表示は "Docker" を保つ（`worker/domain/tag.ts`）。タグは**クイズ単位メタデータ**（軽微編集＝[ADR-0002](adr/0002-publish-flow-and-edit-rules.md)で published でも編集可）。**最大30/クイズ**・1〜30字。
- quiz_tags: `(quiz_id, tag_id)` PK＝**authored タグのみ**（作者が付けた分）。`quiz_id` は quiz 集合体としてカスケード（ソフト削除運用なので発火は Phase 4 のハード削除時のみ）、`tag_id` は NO ACTION。
- tag_edge: `(narrower_id, broader_id)` PK＝タグの**上位下位（subsumption）DAG**（[ADR-0007](adr/0007-tag-subsumption-taxonomy.md)。多親可・両 id は tag へ CASCADE・索引 `tag_edge(broader_id)`）。**実効タグ**（authored＋上位閉包）は読み時に純粋関数 `worker/domain/tag-graph.ts` で導出＝保存しない。絞り込み「広いタグ」は下位閉包で一致。
  - **curate（運用者のみ・MVP は DB/CLI）**: 公開 write API も admin UI も無い。投入は `wrangler d1 execute mazuoboeru-db --remote --command "INSERT INTO tag_edge (narrower_id, broader_id) VALUES ('<下位 tag.id>','<上位 tag.id>')"`（両タグは既存前提＝先に `tag` を確認/作成）。**投入前に巡回チェック**（`wouldCreateCycle`）を通し DAG を維持する。read（グラフ取得）は将来の可視化用に公開予定。

### attempt（挑戦）／ attempt_answer（各回答）
- attempt: `id` / `user_id` / `quiz_id` / `started_at` / `finished_at?` / `score` / `total`。**非公開**。
- attempt_answer: `id` / `attempt_id` / `question_id` / `response`(JSON) / `is_correct` / `answered_at`。採点はサーバー側で確定。
- **invariant**: `attempt_answer.is_correct` は **書き込み後に変更しない**。クイズ編集（重大変更を含む）でも触らない（履歴の改変は不正と見なす、[ADR-0002](adr/0002-publish-flow-and-edit-rules.md)）。

### favorite（お気に入り / "my hot"）
| カラム | 型 | 備考 |
| --- | --- | --- |
| user_id | text | FK → user（CASCADE・本人所有） |
| quiz_id | text | FK → quiz（NO ACTION・一覧は published で絞る） |
| created_at | integer | epoch ms。一覧の並び（新しい順）に使う |
|  |  | PK = (user_id, quiz_id) |

- 本人だけの私的コレクション（[[CONTEXT.md]] Favorite）。挑戦画面のトグルで登録/解除。一覧（"my hot"）は `status='published' AND deleted_at IS NULL` で絞るので、非公開化された favorite は自然に落ちる。

### review_state（SRS・設問ごと・本人のみ）
| カラム | 型 | 備考 |
| --- | --- | --- |
| user_id | text | FK |
| question_id | text | FK |
| ease / interval / due_at | num/int | SM-2 系のパラメータ |
| last_reviewed_at | integer | |
|  |  | PK = (user_id, question_id) |

### report（通報・モデレーション）
| カラム | 型 | 備考 |
| --- | --- | --- |
| id | text | PK |
| reporter_id | text | FK → user |
| target_type | text | `quiz` / `question` / `user` |
| target_id | text | |
| reason_category | text | `spam` / `sexual` / `violence` / `copyright` / `other` |
| reason_text | text? | 自由記述（最大 500 文字） |
| status | text | `open` / `actioned` / `dismissed` |
| created_at | integer | |

- レート制限: 1ユーザ **10件/日** （`cloudflare-workers-bot-scan-defense` で実装）。
- MVP は管理画面なし: 通報は `wrangler d1 execute` で SELECT 確認、`status='hidden'` への更新もコマンド。Phase 2 で Discord 通知、Phase 4 で admin UI。

## 集計（発見・ダッシュボード用）

- 人気クイズ: `attempt` 数・`favorite` 数の集計。頻出ならキャッシュ／事前集計テーブル（`quiz_stats`）化。
- 作者の反響: quiz 別の挑戦数・平均正答率（attempt から）。
- 本人の学習: 正答率・ストリーク・タグ別習熟度（attempt / attempt_answer から）。
- いずれも **公開はクイズ単位の集計まで**。個人の成績は本人のみ。

## インデックス（目安）

- `quiz(status, deleted_at, created_at)` ── 公開タイムライン・新着（`status='published' AND deleted_at IS NULL` で絞る）。
- `quiz(author_id)` ── 作者ページ。
- `question(quiz_id, position)` / `choice(question_id, position)`。
- `quiz_tags(tag_id)` ── タグ別の絞り込み（`quiz_id` は PK のプレフィックスが兼ねるので別索引は作らない）。
- `attempt(user_id, quiz_id)` / `attempt(quiz_id)` ── 本人履歴・クイズ集計。
- `review_state(user_id, due_at)` ── 今日の復習キュー。
- `session(expires_at)` ── 期限切れ掃除。
- `oauth_account(user_id)` ── 「私のリンク済みプロバイダ」表示。
- `api_token(token_hash)` ── PAT 認証時のホットパス（unique）。`api_token(user_id, revoked_at)` ── 管理画面用。
- `report(status, created_at)` ── 通報 triage（手動運用）。
