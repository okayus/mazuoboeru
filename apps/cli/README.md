# @mazuoboeru/cli (`mzo`)

PAT でクイズを作成・編集・公開する薄い CLI。主用途は **AI エージェントによるクイズ量産**。
入力は `POST`/`PATCH /api/quizzes` の body そのもの（薄いパイプ＝検証はサーバ側 zod 一手）。

- 設計判断: [ADR-0001](../../docs/adr/0001-auth-via-oauth-and-pat.md)（PAT）/ [ADR-0002](../../docs/adr/0002-publish-flow-and-edit-rules.md)（公開は明示・不可逆）/ [ADR-0005](../../docs/adr/0005-node24-native-ts-execution.md)（node24・ネイティブ TS 実行）/ [ADR-0014](../../docs/adr/0014-published-quiz-editing-and-question-retirement.md)（公開後編集＝diff-apply・設問の retire）。
- **class なし・関数のみ**。ドメイン（argv パース・リクエスト構築・応答→終了コード写像）は純粋関数、I/O は `src/index.ts` の境界に隔離。

## 必要環境

- **Node ≥ 22.18**（`.ts` をネイティブ実行＝ビルド/トランスパイル不要、ADR-0005）。リポは node24 で統一。

## 認証

PAT は Web の設定画面（Settings）でユーザ自身が発行する（session 限定発行＝CLI からは発行できない）。発行直後の平文を控え、env に入れる。

```sh
export MAZUOBOERU_PAT='mzo_pat_xxxxxxxx'
# 任意。未設定なら本番。dev は localhost に向ける:
export MAZUOBOERU_BASE_URL='http://localhost:5373'
```

## 使い方

```sh
# 作成 (file or stdin)。成功で draft の id を1行 stdout に出す
node apps/cli/src/index.ts create quiz.json
cat quiz.json | node apps/cli/src/index.ts create

# 量産して即公開 (id を捕まえて publish に渡す)
id=$(node apps/cli/src/index.ts create quiz.json) && node apps/cli/src/index.ts publish "$id"

# 編集 (公開済みも可・ADR-0014)。get の出力を編集して丸ごと再送するのが基本
node apps/cli/src/index.ts get "$id" | jq .  > quiz.json   # 設問に id が付いた全内容
$EDITOR quiz.json                                          # 直す (id は残す)
node apps/cli/src/index.ts update "$id" quiz.json          # → updated <id> updated:1 … retired:0 …

# PAT の疎通確認 (認証中のユーザを表示)
node apps/cli/src/index.ts whoami            # → Alice (u_xxx, user)

# 自分のクイズ一覧 (id<TAB>status<TAB>title の1行/件)
node apps/cli/src/index.ts list
node apps/cli/src/index.ts list | grep -P '\tdraft\t' | cut -f1   # draft の id だけ

# クイズ1件を JSON で表示 (全内容・jq 可)
node apps/cli/src/index.ts get "$id" | jq .questions

# workspace スクリプト経由でも可
pnpm --filter @mazuoboeru/cli mzo -- create quiz.json
```

`publish` は **明示・不可逆**（draft → published）。create は常に draft を作る。
`update` は「**望む最終形**」を丸ごと送る（サーバが差分適用）: 設問の `id` あり＝上書き（**type は変更不可**＝409）／`id` なし＝追加／**既存 id をペイロードから省くと、公開済みならその設問は retired（不可逆）**・draft なら削除。誤 id は 400（黙って新規扱いにしない）。応答の diff サマリ（`updated:N added:N retired:N unchanged:N`）で意図どおりか確認すること。公開済みは常に採点可能性（設問 ≥1・選択肢 ≥2＋正解数・許容解 ≥1）を保つ必要があり、崩す編集は 422 `not_gradeable`。

### 読み取りコマンド（`list` / `get` / `whoami`）

いずれも PAT で通る読み取り専用。

- **`whoami`** → `GET /api/auth/me`。PAT が有効かを確かめる。このエンドポイントは未認証でも 200 `{user:null}` を返すので、CLI は本文で判定し、未認証は **exit 1**。
- **`list`** → `GET /api/quizzes/mine`。1クイズ1行のタブ区切り `id<TAB>status<TAB>title`（`cut`/`awk` で合成可）。title の空白は単一スペースに畳む（1行不変条件、正確な title は `get`）。
- **`get <id>`** → `GET /api/quizzes/:id`。作者視点のクイズ全体を整形 JSON で出す（`jq` 可）。他人の / 不在の id は 404。

### 入力 JSON

```json
{
  "title": "基礎プロトコル編",
  "description": "HTTP / TCP の基礎",
  "questions": [
    {
      "type": "mcq_single",
      "prompt": "HTTP の既定ポートは？",
      "explanation": "80 番。HTTPS は 443。",
      "choices": [
        { "text": "80", "isCorrect": true },
        { "text": "443", "isCorrect": false },
        { "text": "22", "isCorrect": false }
      ]
    }
  ]
}
```

一問一答（[ADR-0012](../../docs/adr/0012-short-answer-grading-normalization.md)）は `type: "short"` で、`choices` の代わりに `answer`（許容解の配列・先頭が正準解・≤10 件・各 ≤200 字）を持つ:

```json
{
  "type": "short",
  "prompt": "プロセスが属する各 namespace へのポインタをまとめた構造体は？",
  "answer": ["nsproxy", "struct nsproxy"],
  "explanation": "task_struct->nsproxy。大文字小文字・全半角・空白はサーバが正規化して比較する。"
}
```

`type` は `mcq_single` / `mcq_multi` / `short`（**update で type は変更不可**＝設問を外して新設問として追加する）。制約（タイトル ≤200、設問 ≤100/クイズ、選択肢 ≤20/**問**〔クイズ合計の上限は無い〕等）はサーバが検証し、違反は 400（`issues` を stderr に出す）。公開時の採点可能性（タイトル必須・設問 ≥1・選択肢 ≥2＋正解数・short は許容解 ≥1）はサーバの publish ゲートが強制し、満たさなければ 422。同じ検証は**公開済みクイズの update にも**かかる（[ADR-0014](../../docs/adr/0014-published-quiz-editing-and-question-retirement.md)・422 `not_gradeable`）。

## 出力契約

- **stdout** = データ（create は新 id を bare 1行 / update は `updated <id>` ＋公開済みなら diff サマリ / publish は `published <id>` / list はタブ区切り行 / get は整形 JSON / whoami はユーザ行）。`id=$(… create …)` が成立。
- **stderr** = 診断。
- 終了コード: `0` 成功 / `1` API・実行時エラー（401/403/404/409/422/ネットワーク）/ `2` 使い方・設定エラー（PAT 未設定・不正 JSON・不明コマンド）。

## 開発

```sh
pnpm --filter @mazuoboeru/cli test    # vitest (純粋関数 + 注入 fetch の境界)
pnpm --filter @mazuoboeru/cli check   # tsc --noEmit
```
