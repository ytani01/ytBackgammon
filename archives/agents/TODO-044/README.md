# TODO-044 の分担

表示側の `BoardPoint.checkers` を捨て、`gameinfo` を唯一の状態にする項目。
TODO-042 で「今回いちばん危ない」としていたので、実装・確認・レビューを
3 つに分けた。

| 担当 | モデル | 見たもの | 報告 |
|------|--------|----------|------|
| implementer | Opus 5 / effort medium | `checkers` の除去、`checker_order()` / `checkers_at()` / `top_checker()` の追加、呼び出し元の書き換え | [implementer-report.md](implementer-report.md) |
| verifier | Sonnet 5 / effort medium | 範囲、6 つの検証コマンド、`idx` の値が変わらないこと、指定した 3 通りの破壊 | [verifier-report.md](verifier-report.md) |
| reviewer | Opus 5 / effort high | 「今と同じ駒が返る」かの実測、`apply()` の配り直し、テストの意図、文書との食い違い | [reviewer-report.md](reviewer-report.md) |

**verifier と reviewer を並行で走らせたのは失敗だった。** verifier が
ファイルを壊している最中に reviewer が読み、レビューの対象が揺れた
（reviewer が気づいて報告したので実害は出ていない）。
**次からは reviewer を先、verifier をあとにする。**

振り返りは
[`archives/todo/TODO-044. 盤面の状態を gameinfo 1 つにする.md`](../../todo/TODO-044.%20盤面の状態を%20gameinfo%201%20つにする.md)
にある。
