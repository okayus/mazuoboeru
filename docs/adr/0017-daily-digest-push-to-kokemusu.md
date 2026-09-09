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
