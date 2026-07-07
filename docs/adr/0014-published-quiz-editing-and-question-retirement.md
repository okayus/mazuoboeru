# 公開後の構造編集と設問の引退（retired）

公開済みクイズの構造編集（設問の追加・変更・削除、選択肢の追加・削除・変更）をサーバが受け付ける。[[0002-publish-flow-and-edit-rules]] は「公開後の重大編集は UI 警告のみでサーバは受理」と既決だったが、実装は published への `questions` 変更を一律 409 `cannot_restructure_published` で拒否しており ADR より厳しかった（consumer 側で「設問1問の欠陥を直せずソフト削除→再登録」という実害＝project-status §D）。このギャップを2026-07-06 の grill で解消する。柱は3つ。

1. **設問の削除は物理 DELETE ではなく状態遷移 `question.status: active → retired`（不可逆）**。公開済み設問はほぼ必ず `answer.question_id` / `review_list.question_id`（いずれも NO ACTION FK）から参照されるため物理削除は FK 違反で不可能だし、履歴の自立性（[[0010-server-side-grading-rationale]]・[[0013-retire-attempt-unify-answers]]）は行の存続を要求する。論理削除フラグ（`deleted_at`）ではなく**状態**にしたのは、(a) 実態が「削除」ではなく**公開提示からの引退**（履歴・ダッシュボードには実設問のまま残り続ける）であり意味が正直、(b) quiz 側で予定される deleted の status 統合（project-status §D-3）と語彙が揃う、(c) CHECK 付き ADD COLUMN で済み table rebuild（0008 の難所）が不要、の3点。型を変えたい場合も retire → 新設問の追加で表現する（type は不変）。
2. **編集 API はフル文書 PATCH の diff-apply**（設問単位 CRUD ではない）。クライアントは望む最終形を丸ごと送る——既存設問は `id` 付き＝in-place UPDATE（type 変更は拒否）／`id` 無し＝INSERT（公開済みクイズへの設問追加もこれ）／ペイロードに無い既存 `id`＝retire／未知 `id`＝400（黙って新規扱いにしない）／配列順＝新しい position（並べ替えも兼ねる）。応答に diff サマリ `{updated, added, retired}` を返し、CLI/AI エージェントが意図と実適用を突合できるようにする（omission=retire の危険の補償）。`choice` はどのテーブルからも FK 参照されない（`answer` は question のみ参照）ため、設問ごと delete＋reinsert で置換してよい＝ID 保持の複雑さは question 側だけ。
3. **編集ゲート＝公開ゲートと同一の純粋関数**。published への PATCH は適用後の **active 設問集合**に `validateForPublish` を通し、崩れるなら 422（エラー語彙も公開ゲートと共通）。[[0002-publish-flow-and-edit-rules]] の「サーバは受理」は「**採点可能である限り**受理」に鋭利化（同 ADR 追記参照）＝公開ゲートは「公開時点」ではなく「**公開中は常に**」構造健全性を保証する。意味的な重大編集（正解変更・選択肢の追加削除・retire）は受理し、過去の `answer.is_correct` は再計算しない。

## Considered Options（設問削除の表現）

- **論理削除 `question.deleted_at`** — アンチパターン論の批判のうち本件に実際に当たるのは「削除の意味の曖昧さ」（UNIQUE 阻害は非該当・クエリ述語は状態でも同数）。実態は削除ではないので、フラグより状態が正直。利点なし。
- **構成テーブル分離**（`quiz_question` membership・除外＝membership 行の物理 DELETE・question は不変の事実として残す）— 理論上最も綺麗だが、`question.quiz_id NOT NULL` が残る限り構成の真実が二重化し、消すには question rebuild（0008 の再演）。D1 ではコストが利益を上回る。将来 question を rebuild する機会が来たら再検討の価値あり。
- **アーカイブテーブル移動** — `answer` の FK が生きている限り元行を DELETE できず構造的に不可能（FK を落とせば整合性喪失・履歴 read は UNION 汚染）。
- **物理削除＋FK 緩和（SET NULL）** — `review_list` は question_id が PK の一部で SET NULL 自体が不可能。設問別集計も壊れる。
- **quiz_revision（履歴モデル）** — [[0002-publish-flow-and-edit-rules]] が「MVP の重荷にしない」と既決（Phase 2 候補のまま）。

## Consequences

- migration 0011: `ALTER TABLE question ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired'))`（純粋な ADD COLUMN・rebuild 無し・既存行は全て active）。
- **read の非対称を規約化**: 提示系（公開射影・ドリルプール・単問取得・review_list join・採点受付）は `status='active'` で絞る。履歴系（ダッシュボード集計・回答履歴のラベル）は**絞らない**＝retired 設問の過去回答は実設問文つきで生き続ける。
- 公開済みクイズの不変条件「active 設問 ≥1 かつ全 active 設問が採点可能」を publish 時と published 編集時の**2箇所で同一関数**が保証する。
- 作者 GET（編集ビュー）は active のみ返す。retire の復帰は無い——必要なら新設問として追加（設問別の回答履歴は新 id で仕切り直し）。誤 retire は「未知 id 400＋diff サマリ」で防護する。
- draft の PATCH は従来どおり破壊的全置換（下書き設問は answer/review_list から参照され得ないため安全・payload の id は無視）。retired は draft には存在しない状態。
- Web 編集 UI は本 ADR の範囲外（ブラウザでのクイズ作成は現状未使用のため、当面は CLI `mzo update` のみ。UI は project-status の実装候補へ）。
