# 公開フローと公開後ルール — 「必ず公開」の実装定義

「クイズは必ず公開」を状態遷移と編集・削除ルールに具体化する。状態は `draft` / `published` / `hidden` の3値で `private` は存在しない。`draft` → `published` は作者が押す明示「公開する」ボタンで遷移し、逆方向 (`published` → `draft`) は不可。公開後の編集は軽微（タイトル・説明・設問文・解説）は自由、重大（正解変更・選択肢の追加削除）は UI 警告のみで構造制約はかけず、過去の `attempt_answer.is_correct` は **編集時点で再計算しない**。削除はソフトデリート (`deleted_at`)、ハード削除はアカウント削除フロー（Phase 4）に集約する。`hidden` は通報→違反確定時のモデレータ操作専用で、一般ユーザは検索/直リンクとも 403、作者本人は自身の `hidden` 状態を確認可。

理由: 「必ず公開」は [[0001-auth-via-oauth-and-pat]] と並ぶ mazuoboeru の中心制約。状態に `private` を含めない・`published` から戻せないことを **データモデルで構造的に保証** することで、UI/権限分岐が常に「皆に見える」前提になり [[security.md]] の UGC モデル（サニタイズ・公開クエリ）がシンプルになる。明示公開ボタンは「未完成のまま誤って公開しない」緊張感と「作って後で育てる」柔軟性を両立させる。編集の軽微/重大を構造ではなく UI 警告で区別するのは、`quiz_revision` の編集履歴と `attempt` への title snapshot を MVP の重荷にしないため（Phase 2 候補）。

## Considered Options

- **自動公開（drafts は本人のみ、充足度で自動 `published`）**: 「公開しない選択肢を持たせない」思想に最近接だが、閾値設計（タイトル＋N問＋正解＋解説…）で必ず揉める。手動公開のシンプルさが勝つ。
- **`draft` ⇄ `published` 双方向**: 「必ず公開」と矛盾、検討外。
- **公開後ハード削除可**: 他人の `attempt` 履歴が孤立、データ整合性破壊。MVP では避ける。

## Consequences

- `quiz.status` は CHECK 制約で 3 値 (`draft|published|hidden`) に固定。`deleted_at` は別カラム（ソフトデリート）。
- 公開タイムライン・検索・直リンクのクエリは常に `status='published' AND deleted_at IS NULL` で絞る。
- `attempt_answer.is_correct` は **更新しない invariant**。クイズ編集時にも触らない。
- 重大編集の検出は UI 側の差分警告のみ。サーバは受け入れる。
- Phase 2 候補: `quiz_revision`（編集履歴）、`attempt` への `quiz_title_snapshot`（履歴上で凍結表示）、Phase 4 候補: ハード削除＋ GDPR エクスポート。
