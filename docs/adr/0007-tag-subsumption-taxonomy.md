# タグの上位下位タクソノミ（運用者 curate の DAG・実効タグは導出）

## Context

#44 で導入したフラットなタグ（[[Tag]]）に、Phase 2 で**タグ間の関係**を持たせたい。動機: 広いタグで検索すると関連タグが出て絞り込める／タグ別ダッシュボード（[[0006-dashboard-aggregation-semantics]]）で広いタグにロールアップ／タグ関連をグラフで可視化。例: クイズに "JavaScript" を付けると上位の "programming" も効く。かつ1タグは複数の上位（"programming" と "動的型付け言語"）を持てる必要がある。

マルチユーザー公開サービス（[[security]]）なので、関係は *他人のクイズの実効タグまで一斉に変えるグローバル副作用* を持つ点が中心論点。

## Decision

- **関係は有向の上位下位（subsumption・is-a）1種類**。全体は **DAG（巡回禁止・1タグが複数の上位/下位を持てる多親グラフ）**。汎用の無向「関連」は作らず、関連タグ提示・ドリルダウン・可視化はこの DAG の近傍/閉包から導出する。
- **実効タグは derive（保存しない）**: `quiz_tags` は **authored（作者が付けた分）だけ** を持つ（#44 のまま）。**実効（effective）タグ＝authored タグの上位閉包**を、エッジ集合をロードして**純粋関数で計算**する（再帰 SQL は使わない）。絞り込み・ロールアップ・タグ別集計は実効タグで行う。
- **エッジは運用者（moderator/admin）が curate する共有語彙**。MVP は `wrangler d1 execute` / 小さな CLI で投入（通報 triage と同じ運用）。**公開 write API も admin UI も作らない**（Phase 4 候補）。フラットタグの**作成・付与は従来どおり作者に開放（UGC）**。**グラフの閲覧（可視化）は公開**。
- **巡回はエッジ追加時に拒否**（DAG を維持。純粋関数で到達可能性を判定）。

## Considered Options

- **関係の種類**: 上位下位 subsumption（採用） / 汎用 relatedness / 両方。→ subsumption 1本で auto-apply・関連・可視化を導出でき最小。relatedness は必要になってから追加（可逆）。
- **構造**: 木（単一親） / **DAG（多親・採用）**。→ "JavaScript ⊂ programming かつ ⊂ 動的型付け言語" を表すため多親が必須。
- **auto-apply**: materialize（上位行を物理書き込み） / **derive（採用）**。→ タクソノミは育てて変える前提で、materialize は変更のたび全コンテンツへ backfill が要り脆い。derive はエッジ編集が即時反映で authored が正直なまま。
- **エッジの編集権限**: 全作者 / **運用者 curate（採用）** / 提案＋承認。→ エッジはグローバル副作用＝共有インフラ。全作者開放は汚染・他人コンテンツの間接ラベリング・閉包肥大化の濫用面（[[security]]）。後で開放は容易・締めるのは困難。

## Why

- derive ＋ 多親 DAG なら「JavaScript → {programming, 動的型付け言語} → …」の上位閉包（重複は集合で1つ）を即時に巻き上げられ、タクソノミ変更に backfill が不要。グラフが唯一の真実。
- 閉包・到達可能性の計算を純粋関数へ寄せることで規約（関数のみ・I/O は境界）と整合し、testable。
- エッジを運用者 curate に絞ると、**フラットタグ＝per-quiz UGC（影響は自分のクイズのみ）** ／ **タクソノミ＝信頼境界の共有語彙** という安全な分離になる。

## Consequences

- `quiz_tags` は authored のみ・不変（#44 のまま）。新たに `tag_edge`（下位→上位）を追加（追加 `CREATE TABLE`＝安全）。
- 絞り込み「programming で検索」＝ programming の**子孫集合**を出し、その authored タグを持つ公開クイズを返す。#44 の `quizIdsWithTagKey` をキー集合へ拡張。
- ダッシュボードのタグ別束ねは「クイズの tag」→「**実効タグ**」に更新する（[[0006-dashboard-aggregation-semantics]] を Slice B で改訂）。
- エッジ編集の UI/API は当面なし＝運用者が DB/CLI で投入し、巡回防止チェックを curation 時に行う。実効タグは導出値（保存しない）。
- 「カテゴリ」という別概念は作らない＝上位（広い）タグがその役割を兼ねる。
