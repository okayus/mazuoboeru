# Attempt エンティティを引退し、回答を単一のフラット `answer` に統合する（「挑戦」はクイズ単位 [[Drill]] の UI 動詞として残す）

> **Status: accepted（設計確定）。** 本 ADR は設計判断のみを確定する。物理スキーマ変更・コード載せ替えは [[Drill]]／ダッシュボード改修と束ねて別セッションで実装する（理由は Consequences の「一蓮托生」）。[[CONTEXT.md]] の用語改訂は本セッションで実施済み。（2026-06-24 grill で決定。）

## Context

[[Attempt]]（1クイズ1回ぶんの記録）は現在、未完了の1つをサーバが保持し、開き直すと未回答の設問から **resume** し、全問回答で `finishedAt`/`score`/`total` を確定する状態機械として本番稼働している。2026-06-19 の Slice 2 grill でユーザが「Attempt も進行状態を持たないようにしたい（今回はやらない）」と表明（auto-memory `attempt-to-become-stateless-future`）。今回の grill で着手し、方針を確定した。

着手前のコード調査で鍵となる事実が分かった。

- **`finishedAt`（完了）が実際に効いているのは3点だけ**: ①resume の find-or-create（`findUnfinishedAttempt`）②`attempt_finished` 409 ゲート ③`score`/`total` スナップショット。
- **完了は集計に一切寄与していない**。私的ダッシュボード（`loadUserAnswerFacts`）も設問別正答率（`userQuestionStats`）も、完了に関係なく全 `attempt_answer` を数える＝既に**回答単位の活動量フレーム**（[[0006-dashboard-aggregation-semantics]]）。
- **公開の「挑戦数／正答率」は未実装**（公開射影 `TimelineItem` にその欄が無い）。「完了 Attempt のみ数える」というルールはドキュメント（[[CONTEXT.md]]・`data-model.md`・[[0006-dashboard-aggregation-semantics]]）の中にしか存在しない。
- 一方 [[Drill]]（[[0008-review-list-manual-pool]]）は既に「グルーピング行を作らず `review_answer` に追記するだけ」の**ステートレス・追記専用**の形で本番稼働＝統合先となるフラットモデルの実証がある。

ユーザのビジョンは「クイズへの挑戦」を独立概念から外すこと。[[Drill]] が [[Review List]] だけでなく**クイズ単位**もプールにできるようにし（設問順シャッフルも選べる）、Attempt の役割（1クイズ通し）を Drill のサブモードに吸収させれば、`attempt` は不要になる。ダッシュボードはクイズ別に集計できればよく、それは `answer`→[[Question]]→[[Quiz]] で導けるのでグルーピング行を必要としない。

## Decision

**[[Attempt]] エンティティを引退し、回答を単一のフラットなテーブルに統合する。**

- **`attempt`／`attempt_answer` テーブルと、完了（`finishedAt`）・未回答からの resume・1回ごとの `score`/`total` を廃止する。**
- 回答は単一のフラットなテーブル **`answer(id, user_id, question_id, is_correct, answered_at)`**（索引 `(user_id, answered_at)`）に統合する。実体は現 `review_answer` を **`answer` にリネーム**し、`attempt_answer` を取り込んだもの。
  - **`response`（提出内容）は保存しない**。resume を廃すると読む箇所が無くなるため（YAGNI。将来「回答履歴の見返し」が要れば列追加）。
  - **由来（挑戦／ドリル）は記録しない**。「Answer は Answer」（[[0006-dashboard-aggregation-semantics]]）。クイズ別集計は question→quiz で足り、由来列は今まさに消す区別を復活させるだけ。
  - `quiz_id` 列は持たず question→quiz で導出（現 `review_answer` と同方針）。
- **「挑戦」は UI 動詞として残す**＝「クイズ単位の [[Drill]] を始める」こと（[[CONTEXT.md]] の [[Challenge]]）。ドメインのエンティティとしての Attempt は消える。
- **既存データは移行する**: `INSERT INTO answer (id,user_id,question_id,is_correct,answered_at) SELECT aa.id, a.user_id, aa.question_id, aa.is_correct, aa.answered_at FROM attempt_answer aa JOIN attempt a ON aa.attempt_id=a.id` → その後 `attempt_answer`・`attempt` を DROP。捨てるのは不要にした `response` と「1回ぶんの括り」だけで、集計に使う事実（正誤・時刻・設問）は無損失。**移行を先に・DROP は後**（`attempt_answer.attempt_id→attempt` は CASCADE。`cloudflare-d1-drizzle-migration` の rebuild トラップに従う）。
- **スコープ（本 ADR で確定するのは設計のみ）**: `attempt` の物理削除・`review_answer`→`answer` リネーム＋移行・Challenge 画面のクイズ単位 [[Drill]] 化・集計クエリ（`loadUserAnswerFacts`／`userQuestionStats`）の載せ替え・クイズ単位ドリル UI・ダッシュボードのクイズ別軸は、[[Drill]]／ダッシュボード改修と**同一の実装セッション**で行う。

## Considered Options

- **案A: Attempt を残したままステートレス化**（grouping 行は維持し、resume と完了ゲートだけ撤去、start ごとに新 attempt）。最小変更で「進行状態を持たない」は達成できるが、Attempt と [[Drill]] の二重モデルが残る。ユーザは「クイズ通しは Drill のクイズ単位モードで足りる＝Attempt は不要」と判断し却下。
- **案B（採用）: Attempt を引退し回答をフラット統合**。二重モデルを解消し [[Drill]] に一本化。クイズ通しは Drill のサブモード（クイズ単位プール＋任意シャッフル）。
- **`response` を保存する／しない** → しない（採用）。resume 廃止後に消費する機能が無い。必要なら将来列追加。
- **由来列 `source` を持つ／持たない** → 持たない（採用）。区別の解消が目的。
- **既存データを移行する／破棄する** → 移行（採用）。実際の学習履歴でダッシュボードの連続性に効く。[[0008-review-list-manual-pool]]／migration 0006 が破棄したのは試用 favorite で性質が違う。

## Why

- 「完了」は集計に寄与しておらず（実測）、resume／ゲート／score スナップショットのためだけに存在する＝Attempt の状態機械はユーザ価値に対して過剰。
- [[Drill]] が既にフラット・追記・ステートレスで稼働＝統合先の形は実証済み。リスクの低い「合流」。
- 「挑戦＝クイズ単位の [[Drill]]」はモデルを1つにし、選択肢シャッフル（#61）・[[Immediate Feedback]]・回答単位の集計を自然に共有できる。
- per-quiz 集計は question→quiz で導けるのでグルーピング行は不要（[[Drill]] の facts が既にそうしている）。

## Consequences

- **[[0006-dashboard-aggregation-semantics]] の一部を supersede する**（同 ADR に前方ポインタを追記）。無効化されるのは2点: (1) 「公開集計は**完了 [[Attempt]] のみ**・クイズ単位」＝完了概念が消えるため、公開のクイズ別統計を将来作る場合は `answer` を question→quiz で数える（"完了" で絞らない）。(2) 「`review_answer` は `attempt`/`attempt_answer` には乗せない」＝まさにその分離を解消する。**私的ダッシュボードの集計セマンティクス本体（回答単位・活動量フレーム・JST ストリーク・全指標一律算入）は不変**で、source が `attempt_answer`∪`review_answer` から単一 `answer` に変わるだけ。
- **`docs/data-model.md` の改訂が実装時に要る**: `attempt`/`attempt_answer` 削除、`answer` 追加、§集計の「完了した Attempt のみ」と「attempt から」の記述差し替え。本 ADR 時点では prod が旧スキーマなので data-model.md は実装まで現状維持（docs を prod に先行させない）。
- **一蓮托生（物理削除を今やらない理由）**: `attempt` を DROP すると `loadUserAnswerFacts`／`userQuestionStats`（`attempt` を join）が壊れ、Challenge 画面（`startAttempt`/`submitAnswer` 依存）は代替（クイズ単位 Drill）が無いと**機能退行**し、golden-path e2e も赤くなる。ゆえに物理削除は [[Drill]]／ダッシュボード改修と同一セッションで行う。
- **失われるもの**: 「1回の通しで 7/10」という per-run スコア表示と、未完了からの resume。[[Immediate Feedback]]＋ダッシュボード（クイズ別・設問別）で代替。回答自体は設問単位で残るので**学習履歴は失われない**。
- **再回答の意味変化**: 同一設問に何度でも答えられ、各回が独立した [[Answer]]（オープンブックの再回答＝活動量フレームと無矛盾）。[[CONTEXT.md]] の [[Answer]]「再提出不可」は撤回済み。
- 採点は純関数 `gradeQuestion`（[[0010-server-side-grading-rationale]]）を挑戦／ドリルで共有のまま（既にそう）。
- **UI**: 「挑戦」エントリと「ドリル」エントリを1画面に統合するか否かは実装時の UX 判断（本 ADR は強制しない）。語彙としては「挑戦」を初見クイズの通しに、「ドリル」を [[Review List]] の解き直しに当てる。
