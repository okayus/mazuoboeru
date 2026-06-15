# @mazuoboeru/cli (`mzo`)

PAT でクイズを作成・公開する薄い CLI。主用途は **AI エージェントによるクイズ量産**。
入力は `POST /api/quizzes` の body そのもの（薄いパイプ＝検証はサーバ側 zod 一手）。

- 設計判断: [ADR-0001](../../docs/adr/0001-auth-via-oauth-and-pat.md)（PAT）/ [ADR-0002](../../docs/adr/0002-publish-flow-and-edit-rules.md)（公開は明示・不可逆）/ [ADR-0005](../../docs/adr/0005-node24-native-ts-execution.md)（node24・ネイティブ TS 実行）。
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

# workspace スクリプト経由でも可
pnpm --filter @mazuoboeru/cli mzo -- create quiz.json
```

`publish` は **明示・不可逆**（draft → published）。create は常に draft を作る。

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

`type` は `mcq_single` / `mcq_multi`。制約（タイトル ≤200、設問 ≤100、選択肢 ≤20 等）はサーバが検証し、違反は 400（`issues` を stderr に出す）。公開時の採点可能性（タイトル必須・設問 ≥1・選択肢 ≥2・正解数）はサーバの publish ゲートが強制し、満たさなければ 422。

## 出力契約

- **stdout** = データ（create は新 id を bare 1行 / publish は `published <id>`）。`id=$(… create …)` が成立。
- **stderr** = 診断。
- 終了コード: `0` 成功 / `1` API・実行時エラー（401/403/404/409/422/ネットワーク）/ `2` 使い方・設定エラー（PAT 未設定・不正 JSON・不明コマンド）。

## 開発

```sh
pnpm --filter @mazuoboeru/cli test    # vitest (純粋関数 + 注入 fetch の境界)
pnpm --filter @mazuoboeru/cli check   # tsc --noEmit
```
