# 短答（short）採点は「機械的正規化＋作者の許容解リスト」で行う

Phase 2 の追加設問形式 `short`（[[Short Answer]]・自由入力でタイプする一問一答）の採点を、**比較前の機械的正規化（[[Answer Normalization]]）＋作者が列挙する [[Accepted Answer]] 集合への完全一致**で確定する。意味的な揺れ（かな・シノニム・記号あり無し）は正規化では畳まず、許容解の列挙で表現する。あいまい一致（編集距離）は持たない。許容解と挑戦者入力はプレーンテキストとして扱う。（2026-06-21 決定・**設計のみ／実装は別セッション**。スコープは `short` のみ＝穴埋め `cloze` は「複数空所の short」として後付け可能な形に留め、今回は作らない。）

## Context

- 設計時から「**短答採点の正規化方針**（大小・全半角・表記ゆれ・別解）」は Phase 2 で `short` を入れる時に詰める**持ち越し決定**だった（CLAUDE.md §未決定 / project-status §持ち越し）。本 ADR がその決着。
- ユーザの要望は「穴埋めや『…構造体は？』→『nsproxy』とタイプする解答形式」。これは2形式の混同で、タイプ入力の一問一答＝`short`、文中空所＝`cloze`。今回のスコープは `short`（grill で確定）。
- 既存採点は**選択肢 ID 集合の一致**（`worker/domain/grading.ts` の `gradeSelection`/`gradeQuestion`）。サーバー権威（[[0010-server-side-grading-rationale]]）。`short` は choice を持たず入力が文字列なので、この採点モデルに**型の異なる枝**が要る。
- **出荷スキーマに `question.answer` 列は無い**（data-model.md の `answer text?` は設計案で未実装＝現物 `worker/db/schema.ts` で確認）。`question.type` は `0001_phase1_slice.sql` で `CHECK (type IN ('mcq_single','mcq_multi'))`。
- 採点は**競争的 anti-cheat ではない**（ランキング無し＝[[0010-server-side-grading-rationale]]）。正解を先に見ても損するのは本人だけ＝**寛容に倒してよい**。アプリ思想「まず覚える」は、IME 由来の全角や大小といった些末な不一致で学習者を弾かない方向と相性が良い。
- UGC は markdown ＋ rehype-sanitize で AST 描画・生 HTML 非描画（[[0004-ugc-markdown-rendering]]）。
- クライアント↔サーバ契約は Hono RPC で単一真実化（[[0011-hono-rpc-typed-contract]]）＝送信入力・応答 DTO はハンドラ由来。

## Decision

1. **正規化は機械的ノイズのみ**（[[Answer Normalization]]）: Unicode NFKC（全角英数・互換文字を半角へ）＋前後 trim ＋連続空白の畳み込み＋小文字化を、**挑戦者の入力と各許容解の両辺**に適用してから**完全一致**で比較する。かな揺れ・シノニム・記号あり無しは正規化では畳まない。あいまい一致（編集距離・部分一致）は行わない。純粋関数 `worker/domain/` に新設（`normalizeAnswer()`）。
2. **意味的変種は作者の許容解リストで明示**（[[Accepted Answer]]）: `question` に nullable な JSON 列 `answer` を1本追加。`short` は `{"accept": [<生文字列>, ...]}`（**生で保存**し採点時に正規化、`accept[0]` を**正準解**としてフィードバック表示）。`cloze` 化時は `{"blanks": [{"accept": [...]}, ...]}` に `question.type` で**分岐拡張**（今回は作らない）。
3. **許容解と挑戦者入力はプレーンテキスト**（markdown/HTML 非描画。JSX に文字列として渡し React の既定エスケープに委ねる）。`prompt`/`explanation` は従来通り markdown ＋ sanitize。
4. **採点は判別共用体の新枝**: `gradeQuestion`/`decideAnswer`、送信 zod、応答 DTO を `question.type` で分岐（`mcq_*`＝選択肢 ID 集合一致 / `short`＝正規化テキスト一致）。サーバー権威・即時フィードバック・**読みモデル分離**（公開射影 `publicQuizJson` に `answer` を出さない＝`is_correct` と同じ扱い）は不変。応答の `correctChoiceIds` 相当は `short` では正準解（＋必要なら許容解一覧）を返す。
5. **公開ゲート**: `short` は「**許容解 ≥1（非空）**」を要求（`validateForPublish` に新 `PublishErrorCode`）。1クイズ内で `mcq_*` と `short` の混在は可（型は設問単位）。
6. **マイグレーション**: `answer` 列追加（`ADD COLUMN`＝安全）＋ `type` CHECK を `('mcq_single','mcq_multi','short')` へ拡張。SQLite は CHECK 変更＝**table rebuild**で、`question` は FK 子（`choice`・`attempt_answer`・`review_list`・`review_answer`）を持つため、スキル `cloudflare-d1-drizzle-migration`（FK OFF のカスケード削除回避・本番バックアップ・前後の行数チェック）に**必ず**従う。

## Considered Options

- **正規化の強さ**: (A) 機械的ノイズのみ〔**採用**〕／ (B) かな・記号・長音も畳む（学習者に優しいが「ソフトウェア≠そふとうぇあ」のように区別したい答えを誤って正解にし、ルールが不透明）／ (C) trim のみ厳密（IME 全角・大小で頻繁に誤判定＝学習体験が悪い）。
- **別解の保存**: (α) `question.answer` に JSON 1列〔**採用**〕／ (β) 専用テーブル `accepted_answer`（relational だが、表示も集計もしない採点キーを第一級エンティティ化する重さ＋ multi-row INSERT の 100-param 分割＝[main `4a22827`/#65] の轍）／ (γ) 単一 text に正準解1つ・別解なし（(A)＋「意味的変種は許容解で吸収」という前提と矛盾し、cloze 化でも作り直し）。
- **照合方式**: 正規化後の完全一致〔**採用**〕／ ファジー照合（編集距離・あいまい一致）＝却下（anti-cheat 不要で寛容にはしたいが、予測不能な誤正解は学習体験を損なう。寛容さは作者制御の許容解で出す）。
- **描画**: プレーンテキスト〔**採用**〕／ markdown（`prompt` 等と一貫だが、1トークンの答えに過剰・「正規化の対象が markdown ソースか描画後か」が曖昧）。
- **スコープ**: `short` のみ・cloze ready〔**採用**〕／ `short`＋`cloze` 同時（穴埋めの空所表現・複数空所採点・UI まで増える）／ `short` のみ・前方互換なし（cloze で作り直し）。

## Why

- 持ち越しの「正規化方針」を、**予測可能で説明可能な純粋関数（機械的ノイズのみ）＋作者制御の許容解リスト**へ分解して決着させた。正規化の強さを後から変えると**既存の全 short 設問の採点結果が変わる**＝後戻りしにくいので ADR 化する。
- JSON 1列は data-model.md の「`type` 別 payload は将来 JSON」方針と一致し、`cloze` へ無改造で拡張でき、専用テーブルの param 分割を避ける。
- プレーンテキストは攻撃面を増やさず（[[0004-ugc-markdown-rendering]] の精神）、正規化の対象を一意にする。
- サーバー権威・読みモデル分離（[[0010-server-side-grading-rationale]]）と Hono RPC 契約（[[0011-hono-rpc-typed-contract]]）はそのまま＝`short` は既存原則の自然な拡張であって例外ではない。

## Addendum（2026-06-21・実装時に判明した migration の実体）

Decision §6 は「`type` CHECK を広げる＝table rebuild、スキルに従う」とだけ書いたが、実装で **`question` rebuild は単純な drop→recreate では D1 で必ずデータを壊す**ことが分かった（`pnpm db:migrate`＝miniflare で再現）。確定した手順を残す。

- **問題**: `question` は子4テーブルに参照される——choice・review_list（`ON DELETE CASCADE`）と attempt_answer・review_answer（NO ACTION）。`DROP TABLE question` は全行の暗黙 DELETE を伴い、(a) choice・review_list を**カスケード削除**し、(b) NO ACTION 参照を**違反**させる。`PRAGMA foreign_keys=OFF` は D1 が無視（スキルの trap）、`defer_foreign_keys` は **migration の文ごとのコミットをまたがず効かない**（miniflare で実証＝3-rebuild 案が FK 違反で失敗）。
- **採用した手順（migration 0008）**: FK 強制を ON のまま、**子4テーブルすべてを新 `question`（=`question_new`）へ repoint してから旧 `question` を drop→rename** する（どの文境界でも dangling 参照ゼロ＝miniflare/D1 双方で成立、`foreign_keys=OFF` に依存しない）。
- **あわせて choice・review_list の `question_id` を CASCADE→NO ACTION に降格**した（[[data-model]] 反映済み）。理由は将来の設問形式追加（`boolean`/`cloze`）でも `question` を rebuild する必要があり、CASCADE 子があるたびに巻き込み削除リスクが再来するため。降格に伴い **choice の削除はアプリ側（`replaceDraftContent` が question 削除前に明示 DELETE）**へ移した（draft の question は未公開＝review_list 参照は無いので review_list 側の明示削除は不要、Phase 4 のハード削除時に対応）。
- **remote 適用は host-supervised**: `wrangler d1 export --remote` バックアップ＋子テーブルの行数前後比較（runbook）。**Relay-Merge は付けない**＝人手 merge。検証: ローカル適用で `question` の CHECK/answer 列・全子の `REFERENCES question` 復帰・`PRAGMA foreign_key_check` clean・行数保全を確認。
- **将来**: 設問形式を増やすたびに同種の rebuild が要る。型の語彙は zod でも強制しているので、次に追加する時は **CHECK を撤廃してアプリ層強制に寄せる**選択肢も検討（rebuild をこの1回で終わらせられる。本 ADR の Decision は「広げる」だが、ここで再評価の余地を明記）。
