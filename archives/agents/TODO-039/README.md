# TODO-039 の分担

| 担当 | モデル | 何を頼んだか |
|------|--------|--------------|
| implementer | Sonnet 5 | 4 つの置き換えと、`Cache-Control` のテスト |
| verifier | Sonnet 5 | 検証一式、`?sound` の 4 通り（実装担当が試していない `?sound=` を名指し）、WebSocket がつながるか、実サーバでのヘッダ |
| reviewer | Opus 5 | 置き換え前後で値が同じかを入力の種類ごとに出し切る |

挙動が変わりうる項目なので、確認とレビューを分けた。reviewer は
「出し切る」判断が要るので、定義の sonnet を Opus 5 に上書きしている。

**結果として、`?sound=` の食い違いは verifier（名指しで頼んだ）と
reviewer（自分で見つけた）の両方が捕まえた。**
`ui/base.js` のクラス階層図の消し漏れは reviewer だけが見つけた。
詳しくは
[archives/todo/TODO-039. 手書きを標準機能に置き換える.md](../../todo/TODO-039.%20手書きを標準機能に置き換える.md)
の「分担の振り返り」。

- [implementer-report.md](implementer-report.md)
- [verifier-report.md](verifier-report.md)
- [reviewer-report.md](reviewer-report.md)
