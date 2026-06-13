# UGC Markdown は react-markdown で AST 描画し、生 HTML を描画しない（DOMPurify 文字列注入を採らない）

mazuoboeru は他ユーザの書いたクイズ本文・解説（UGC）を別ユーザのブラウザに表示する公開サービスで、ここが最大の XSS 攻撃面（[[security.md]]）。当初ドキュメントは「レンダリング後を DOMPurify でサニタイズ」と表現していたが、Phase 1 着手にあたり方式を **`react-markdown`（remark/rehype）による AST 描画 ＋ `rehype-sanitize`** に確定する。HTML 文字列を生成して `dangerouslySetInnerHTML` で注入する経路は採らない（`rehype-raw` を入れないので Markdown 中の生 HTML はそもそも描画されない）。Markdown は**原文のまま保存し描画時にレンダリング**し、描画は単一の共有コンポーネント（`<QuizMarkdown>`）に集約して remark/rehype プラグイン列と要素マップを一点管理する。

理由: 「サニタイズ後の HTML 文字列を信じて innerHTML する」設計は、サニタイザ設定を一度でも誤ると即 XSS で、かつレビューで `dangerouslySetInnerHTML` を恒常的に許容する悪習を生む。react-markdown は HTML 文字列を介さず AST から React 要素を組むため、既定で生 HTML を描画せず（`rehype-raw` 未導入が前提）、危険プロパティの素通しが構造的に起きにくい。`rehype-sanitize` を strict schema で重ねて多層防御とする。プラグイン構成にしたのは拡張容易性のため: Markdown 原文保存と単一 renderer により、将来 **mermaid（```mermaid フェンス → `code` 描画の差し替え）・数式（KaTeX, remark-math/rehype-katex）** を**保存形式の移行なし**で足せる。画像（`![]()`）と mermaid は MVP では描画しない（後述）。

## Considered Options

- **marked / markdown-it ＋ DOMPurify ＋ `dangerouslySetInnerHTML`**: 当初 docs の字面。軽量で柔軟だが、防御がサニタイザ設定の一点に集中し、設定ミスが即 XSS。`dangerouslySetInnerHTML` の常用が習慣化する。SVG/数式の追加時にサニタイズ schema を手で広げる必要があり、攻撃面の管理が難しい。
- **react-markdown ＋ rehype-sanitize（採用）**: AST 描画で生 HTML を描画しない。プラグインで拡張でき、要素マップで `a`（`rel="noopener"` 強制・`javascript:` 排除）等を一点制御。バンドルは marked より重く React 結合だが、フロントは元々 React 19。
- **生 HTML を許可（rehype-raw 等）**: UGC では論外。検討のみで却下。

## Consequences

- 依存追加: `react-markdown`・`rehype-sanitize`（＋必要に応じ `remark-gfm`）。`rehype-raw` は**入れない**（入れると生 HTML が描画され前提が崩れる＝レビュー時の禁止事項）。
- **画像は MVP では描画しない**（リンク表示に留める）。理由: 外部画像 URL の読み込みは閲覧者の IP/UA を作者指定サーバへ渡す（トラッキング面）・混在コンテンツ・CSP 緩和を伴う。CSP は `img-src 'self'` まで絞れる。画像許可は Phase 2 で再検討。
- **mermaid は MVP では描画しない**。mermaid は SVG を出力し新たな XSS 面（過去に injection 報告あり）。導入時は `securityLevel:'strict'` ＋ SVG サニタイズ ＋ CSP 見直しが要るため Phase 2。アプリ構造（原文保存＋単一 renderer＋`code` 描画差し替え）は導入を移行コストなしで受け入れられる形にしておく。
- 関連ドキュメントの「DOMPurify」表記は本 ADR の方式に更新済み（[[security.md]]・[[tech-stack.md]]・[[features.md]]）。CLAUDE.md の「Markdown を許すなら生 HTML は禁止」とは整合。
- 保存するのは Markdown 原文（HTML を事前生成して保存しない）。将来描画器を差し替えても保存データの移行が不要。
