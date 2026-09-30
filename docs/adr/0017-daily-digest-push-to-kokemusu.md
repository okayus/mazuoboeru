# 日次ダイジェストを kokemusu へ push する（アウトバウンド連携の境界形）

> **Status: accepted（2026-09-03。方針は kokemusu 側セッションの grill で確定、本 ADR は mazuoboeru 側の設計決定を記録）。**

## Context

作者の日記サービス **kokemusu**（自己ホスト・完全プライベートの別 Worker）に、「まず覚える」の1日を毎日1本の投稿（年表の石）として残したい。受け側は汎用の `POST /api/posts`（`{body, title?, tags?}`・PAT Bearer・201）で**送り側を知らない**——出所は送り側が `tags` で名乗る。受け側契約: body ≤20,000 字（Markdown 可）／title ≤200／tags ≤20、401=トークン失効、429=120/分・IP、**Idempotency-Key は無い**（kokemusu ADR-0002「必要になってから」）。スキル `cloudflare-workers-pat-bearer-auth`（Callers「Another Worker, personal use」）と `cloudflare-cron-to-discord` の境界パターンに従う。

mazuoboeru 側の前提は grill で2点ズレが判明した: (1) 既存の Discord push は**存在しない**（`worker/cron.ts` は毎時 :15 のハートビートのみ）、(2) 「今日の結果」の定義が未定義（本人の成績か、サービス全体か）。env は `KOKEMUSU_PAT`・`KOKEMUSU_URL` の**2つだけ**が用意済み＝owner を特定する手段は設計に含まれていない。

## Decision

1. **送るのは [[Daily Digest]]（CONTEXT.md）＝サービス全体の集計のみ**。回答数・正答数・回答者数（数のみ）と、その日に公開された（かつ送信時点でも公開中の）クイズのタイトル＋リンク。**個人を特定するもの（誰が・どの設問・正誤の内訳・表示名・ストリーク）は送らない**——「個人の学習履歴・成績は非公開」（docs/security.md）を、行き先が作者私有の日記でも崩さない。owner-scoped ではないので、将来他ユーザが増えても意味が壊れない（数が増えるだけ）。
2. **窓＝直前に完了した JST 暦日、送信＝00:15 JST**。cron に `"15 15 * * *"`（UTC）を追加し `event.cron` でディスパッチ（毎時ハートビートは維持）。日境界は ADR-0006 の `jstDay` を共有（`worker/domain/jst-day.ts` へ抽出）——ダッシュボードと Daily Digest で「1日」の定義が二重化しない。前日方式なので深夜の回答を取りこぼさない（同日 23:15 送信案は 23:15 以降の回答が落ちるため却下）。
3. **形＝純粋ビルダー＋throw しない境界**。`buildDailyKokemusuPost(results, origin)`（純粋・table test）が投稿を組み、**活動ゼロの日は `null`＝送らない**（日記に空の石を積まない）。境界 `postWithBearer(url, token, payload)` は **HTTP status だけログ**（token・body はログに出さない）・**例外を投げない**——kokemusu 停止が cron 本体や将来の同居ジョブ（Discord 通知等）を道連れにしない。
4. **リトライしない**。受け側に冪等キーが無い以上、リトライは二重投稿になり得る。失敗した日の石は**欠けたまま**（埋め戻さない）。翌日の cron が翌日の石を置く。
5. **env は名前参照のみ（ADR-0003）**。`KOKEMUSU_URL`／`KOKEMUSU_PAT` が未設定なら**黙ってスキップ**（ログのみ）——dev・preview で誤送信しない fail-quiet。
   **置き場所（2026-09-05・ホストで確定）**: `KOKEMUSU_URL` は秘密ではない（作者自身の公開ホスト名）ので `apps/web/wrangler.jsonc` の `vars` に**コミット**する。deploy は `vars` を設定ファイルの内容で丸ごと置き換えるため、dashboard で足した平文 var は次の Workers Builds で消えるが、コミットされた var は消えない。`KOKEMUSU_PAT` だけが Worker Secret（`wrangler secret put`・コードは名前参照のみ）。

## Considered Options

- **owner-scoped（作者本人の成績を送る）**: 学習日記としては自然だが、cron に「誰が owner か」を教える追加 env か `role='admin'` 依存が要る。kokemusu セッションが用意した env は URL と PAT だけ＝この設計を意図していない。集計のみなら owner 特定は不要。却下（欲しくなったら owner 特定手段とセットで別途）。
- **同日 23:15 JST 送信**: 「今日」の投稿になるが 23:15 以降の回答を恒久的に取りこぼす。学習アプリで深夜の回答は現実に多い。却下。
- **リトライ／Idempotency-Key**: 受け側未実装（YAGNI 明言）。二重投稿 > 1日欠け。却下。
- **Queues／Workflows**: 1日1 POST・数百 ms に対して過剰。`ctx.waitUntil` の 30 秒上限にも遠い。却下。

## Consequences

- 実行系が同一 tick を二重発火した場合は二重投稿があり得る（自前リトライはしないので通常は起きない）。受け入れ。
- 401 が出たら kokemusu 側で PAT 再発行→ `wrangler secret put KOKEMUSU_PAT`。検知は observability のログ（`[kokemusu] POST /api/posts -> 401`）。
- 「その日公開されたが同日中に hidden／削除されたクイズ」はダイジェストに載らない（送信時点の公開状態で読む）。仕様。
- 将来の cron ジョブ（通報の Discord 通知等）は同じ `event.cron` ディスパッチ形に載せる。
- スキーマ変更なし（読みだけ）。`answer.answered_at` の範囲スキャンは無索引だが1日1回・現規模では問題ない（増えたら index を検討）。

## 補記（2026-09-09）: 契約は転記しない — 受け側の公開文書と vendoring した schema を読む

Context に書いた受け側契約（`{body, title?, tags?}`・title ≤200 など）は、kokemusu 側セッションの grill で聞いた内容を
**人手で転記**したものだった。kokemusu は 2026-09-03 の 3 日後（[kokemusu ADR-0006](https://raw.githubusercontent.com/okayus/kokemusu/main/docs/adr/0006-no-post-title.md)、2026-09-06）に `title` を廃止し、知らないキーを
`400 validation_error` で拒むようになった。本 ADR の実装は 2026-09-05 に本番へ載っていたので、**活動のあった日の 00:15 push は
毎晩 400** で石が積まれていなかった。境界は HTTP status しかログせず（設計どおり）、`kokemusu-post.test.ts` は `title` を期待し、
kokemusu 側の test は `title` を 400 と検査し、両方 green のまま 3 日が過ぎた。コンテナ内の Claude は相手のリポを見ないので、
どちらの側も相手を確認できなかった。

**直したこと**: `title` を外し、`firstDay` に前日（`results.date`）を入れる（受け側は 2026-09-06 から `firstDay` を受け、
苔片を「送った日」ではなく「在った日」に積める）。題が担っていた「まず覚える」と日付は、タグ `mazuoboeru` と `firstDay` が担う。

**以後の規則**: 受け側の契約を本 ADR や CLAUDE.md に転記しない。正は kokemusu の
[`docs/senders.md`](https://raw.githubusercontent.com/okayus/kokemusu/main/docs/senders.md)（public リポ。sandbox の egress
firewall は GitHub の IP レンジを通すので、コンテナ内から `curl` で読める — 2026-09-09 実測）と、そこから vendoring した
`apps/web/worker/domain/kokemusu-posts.schema.json`（受け側が zod スキーマから生成し CI で一致を検査している JSON Schema。
`pnpm kokemusu:schema` で差し替える）。`kokemusu-post.test.ts` は builder の出力を `z.fromJSONSchema(schema)` で検証するので、
受け側の wire が変われば schema を更新した時点でここの test が落ちる。更新の合図は受け側 `senders.md` の変更履歴、または
本番ログの `[kokemusu] POST /api/posts -> 400`。リトライしない・冪等キー無しの判断は変えない。

## 補記（2026-09-11）: 石のタグ — 「まず覚える」＋その日の活動に関わった公開クイズのタグ、上限は受け側の schema から読む

投稿の `tags` を `["mazuoboeru"]` から **`まず覚える`（出所）＋その日の活動に関わった公開クイズのタグ**（[[Daily Digest]]、CONTEXT.md）へ変え、
`kind` は常に `both` にする。

- **タグの源**: その日に [[Answer]] が 1 件以上あった [[Quiz]]（誰の回答でも・[[Drill]] の出所は問わない＝`answer` は出所を持たないので
  「チャレンジされたクイズ」を字義どおりクイズ単位 Drill に限ることは計算不能）と、その日に公開された Quiz の**和集合**。どちらも
  **送信時点で公開中**（published かつ未削除）のものだけ＝公開クイズ一覧と同じ規則で読む（モデレータが hidden にしたクイズのタグを
  日記へ運ばない）。回答数の集計には公開フィルタが無いので非対称になるが、「数だけ」と「名前を外へ出す」で基準が違うのは意図。
  公開だけの日にも公開したクイズのタグが付く（本文が公開を載せるのに、タグだけ片側に絞らない）。
- **出所タグは `まず覚える` 1 つ**。`mazuoboeru` は送らない。受け側 `senders.md` の `["mazuoboeru"]` は例示で、名前や ASCII の要求ではない。
  日記の持ち主が読む名前はアプリ名の日本語表記。2 つ置くと枠を 2 つ消費し、常に同時に現れる 2 石が並ぶ。既に `mazuoboeru` で積まれた石
  （#98 以降の活動日ぶん・多くて数個）は受け側で手直しする。
- **上限を転記しない**: builder は `kokemusu-posts.schema.json` の `tags.maxItems`（と `body.maxLength`）を読む。受け側が上限を変えたら
  `pnpm kokemusu:schema` の再 vendoring だけで追随し、`maxItems` が schema から消えれば型エラーで止まる（黙って無制限にならない）。
  超える日の切り方は **`まず覚える` を先頭に固定、残りは回答数の多いタグ順・同数は名前順（文字コード順）** で決定的にする
  （公開だけのタグは回答 0 として末尾）。本番の実測（公開 74 クイズ・138 タグ、1 クイズ中央値 6 タグ）では 3〜5 クイズ解いた日で
  14〜22 タグに達し、受け側の 20 では日常的に切れる。
- **受け側の 20 は編集上の数**（kokemusu `worker/core/tag.ts` の `MAX_TAGS_PER_POST`。理由の記録なし。`createPostSchema`・`?tags=` AND・
  SPA のチップ入力の 3 か所に写る）。物理上限は D1 の bound parameter **100**（kokemusu の既存タグ引き `inArray(norm, …)` ＋ `user_id` の 1）
  なので、受け側で **99 へ上げる**（kokemusu 側の PR・別セッション。schema 再生成と `senders.md` 変更履歴は kokemusu ADR-0008 の手順）。
  `maxItems` の撤廃はしない＝物理上限を送り側が知る手段が無くなる。本補記の実装はそれを待たない: 先に 20 で動き、再 vendoring で追随する（kokemusu は 2026-09-11 に 99 へ引き上げ＝kokemusu #57、
  こちらは 2026-09-12 に再 vendoring＝同じ PR #100。builder 側の変更はゼロ）。
- **`kind` は `both` 固定**（持ち主の判断）。回答（想起）も公開（作る）も混ざる日次集計に、日の内訳で向きを変えても情報にならない。
- 変えないもの: サービス全体の集計のみ（owner を特定しない）・前日窓・throw しない境界・リトライなし・活動ゼロは送らない。
  スキーマ変更・migration なし（読みだけ。answer→question→quiz→quiz_tags→tag の 1 日 1 回の join）。

## 補記（2026-09-21）: 同じゾーンの Worker への fetch は、フラグが無いと相手に届かない（error 1042）

**実測した事実。** 本番稼働（2026-09-05）から 2026-09-21 まで、日次ダイジェストは一度も kokemusu に届いていなかった。

- 両アプリの本番 D1 の dump（2026-09-20）を突き合わせると、回答か公開のあった 09-05 / 09-07 / 09-13 / 09-14 / 09-15 / 09-16 のどの日にも、kokemusu 側に Cron 由来の石が無い。`まず覚える` タグの石は 2 つあるが、作成時刻は 09-09 17:30 と 09-12 23:56 で、00:15 の tick が作ったものではない。
- kokemusu の PAT「mazuoboeru」の `last_used_at` は発行当日（2026-09-03 12:07 JST）のままだった。受け側は有効な PAT の要求が来るたびに（1 時間に 1 回まで）これを進めるので、Cron の要求は一度も認証まで到達していない。
- 2026-09-21 00:15 JST の tick を両 Worker の `wrangler tail` で採った。送り側は `[cron] fired … (15 15 * * *)` に続けて `[kokemusu] POST /api/posts -> 404` を記録し、受け側には同じ時刻に `POST /api/posts` の要求が届いていない（受け側自身の毎時 cron だけが記録された）。

**原因。** mazuoboeru と kokemusu は同じアカウントの `shiraoka.workers.dev` にいる。Cloudflare は、同じゾーンの別の Worker への global `fetch()` を、`global_fetch_strictly_public` 互換フラグが無いかぎり相手の Worker へ回さず、代わりに 404（error 1042 "Worker tried to fetch from another Worker on the same zone"）を返す。送り側の `compatibility_date` は 2025-03-28 で、このフラグは既定では有効にならない。発行当日にホストから `curl` で打った確認は公開インターネット経由なので通り、これが「配線は済んだ」という誤った安心を作った。

**気づけなかった理由。** (1) 送り側の境界は状態コードしか記録せず、「404」は受け側のアプリが返したものにも見える。本文の `error code: 1042` が見えていれば初日に分かった。(2) 単体テストと契約テストは fetch を差し替えるので、プラットフォームの経路の挙動は原理的に検出できない。(3) 「次の活動日の tick で 201 を実測」は 09-05 / 09-12 に 3 回「残り」に書かれ、一度も行われなかった。(4) 2026-09-20 には、石の存在だけを見て「tick は通った」と誤って記録した（作成時刻を見ていなかった。kokemusu の log に訂正を入れた）。

**決定。**

- `wrangler.jsonc` に `"compatibility_flags": ["global_fetch_strictly_public"]` を入れる。要求は Cloudflare の入口へ回り直し、インターネットからの要求と同じに扱われる。受け側の PAT の契約（送り側がどこにいてもよい）とも合う。
- Service Binding は採らない。送り側を受け側の配備に結びつけ、受け側を「誰からでも PAT で受ける」一般の口でなくしてしまう。
- 境界は、非 2xx のとき応答本文の先頭 160 字も 1 行で記録する（token と要求本文は引き続き記録しない）。

**残り。** このフラグを入れた版が配備された後の最初の活動日の翌 00:15 JST に、(a) 送り側のログが `-> 201`、(b) kokemusu の `api_token.last_used_at` が進む、(c) その日の石が立つ、の 3 点を確かめる。ホストの週次 dump（`~/backups/d1/`）か `wrangler tail` で測れる。失敗を人が見る場所へ知らせる仕組み（Discord など）はまだ無く、別の決定として残る。

## 補記（2026-09-30）: フラグでは届かなかった — 経路を Service Binding にする

**実測した事実。** 2026-09-21 の補記で入れた `global_fetch_strictly_public` を載せた版（`9cd7fe5c`、09-21 11:44 JST 配備）でも、日次ダイジェストは一度も届いていない。

- 配備後の活動日（09-21 回答 6・09-22 回答 24・09-23 公開 1・09-25 回答 46・09-27 回答 2）の翌 00:15 JST に、kokemusu 側に Cron 由来の石が無い（本番 D1 を 09-27 と 09-28 に読んだ）。
- kokemusu の PAT「mazuoboeru」の `last_used_at` は依然として発行日（2026-09-03）のまま。受け側は有効な PAT の要求ならルート処理の前に必ずこれを進めるので、**有効な PAT を持つ要求は一度も受け側に到達していない**。契約違反（400）でも進むので、契約の問題ではない。
- 送り側の本番設定は正しい（settings API でフラグ・`KOKEMUSU_URL`・`KOKEMUSU_PAT`・cron 2 本を確認。毎時 tick は 09-27 10:15 JST に同じ版で発火するのを `wrangler tail` で実測）。
- 使い捨ての Worker を `wrangler dev --remote` で上げて kokemusu へ fetch すると、**フラグの有無に関わらず** `404` / `error code: 1042` が返る（`nodejs_compat` の対照実験で、フラグ自体はプレビューに適用されている）。配備済み Worker では同じフラグで同アカウントの workers.dev に通ったという外部の実測もあり、プレビューが 1042 の代表になるかは分からない。送り側の 00:15 のログ行（`[kokemusu] POST /api/posts -> …`）は Workers Logs にしか無く、`wrangler login` の OAuth トークンでは telemetry API が 403 で読めないため、404（未到達）と 401（PAT 不一致）のどちらかは未確定のまま。

**決定。** 経路を **Service Binding**（`wrangler.jsonc` の `services: [{ binding: "KOKEMUSU", service: "kokemusu" }]`、`cron.ts` が `env.KOKEMUSU.fetch` を `postWithBearer` に注入）に変える。フラグは外す。

- 09-21 に「採らない」とした理由は、送り側を受け側の配備に結びつけることと、受け側を「誰からでも PAT で受ける」一般の口でなくすことだった。後者は起きない: 受け側の契約（`POST /api/posts`・Bearer PAT・`senders.md`）は一文字も変わらず、受け側は引き続き公開インターネットからも受ける。前者は「同じアカウントにいる」という既にある事実を wrangler.jsonc に書くだけで、kokemusu が別アカウントや custom domain へ移る日が来たら、その時に URL + PAT の公開経路へ戻せる（別ゾーンへの fetch は 1042 の対象外）。
- 1042 の可能性を経路ごと消す方が、フラグの効き方を本番で一日ずつ確かめるより速い。一日一回しか観測できない経路で候補を一つずつ潰すのは、二週間の空白の再演になる。
- 受け側への影響は、`CF-Connecting-IP` が付かず rate limit のキーが `unknown` になることだけ（binding 経由の送り側同士で 120/分を共有。日次 1 件には無関係）。CSRF は Bearer 免除のまま。受け側の変更は不要。
- 境界 `postWithBearer` は fetch を注入できる形だったので、変更は `cron.ts` の配線と型だけ。URL は kokemusu 内の宛先を指す役目で残す。binding が無い環境（local dev・e2e・preview）は URL/PAT 未設定と同じく黙ってスキップする（`kokemusuWire`、test で固定）。

**残り。**

- 配備後の最初の活動日の翌 00:15 JST に、(a) 送り側のログが `-> 201`、(b) `last_used_at` の前進、(c) 石の到着、を確かめる。毎朝の判定は app-check の pipelines（okayus-skills #47。09-22 以降ほぼ毎朝、wrangler の OAuth refresh 直後の 7403 で判定不能だったので同日に直した）。
- それでも届かなければ残る候補は PAT の不一致（401）だけ。kokemusu 側で PAT を再発行し、ホストで `curl … /api/auth/me` が 200 を返した値を `wrangler secret put KOKEMUSU_PAT` する（kokemusu 側の Worker にも `KOKEMUSU_PAT` という secret が誤って存在する＝put 先の取り違えの痕跡）。
- kokemusu の `senders.md` に「同じアカウントの Worker からは Service Binding で」を書く（kokemusu 側の PR）。matatabetai の ADR-013 も同じ形にする。okayus-skills `cloudflare-workers-pat-bearer-auth` 0.3.0 の「フラグで直る」も改める。
- 09-05 以降の活動日の石は再送しない（§4）。
