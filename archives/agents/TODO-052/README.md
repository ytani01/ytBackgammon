# TODO-052 の分担

表示部品が持つ状態の写しを消し、判定では `gameinfo` を読む項目。
`actions.js`・`board.js`・`ui/` と `tests/browser/` にまたがり、
「押してよいか」の判定の読み先が変わるので、実装・確認・レビューを分けた。

**実装とレビューは Opus 5 に上書きした**（TODO-050・051 と同じ理由）。確認は定義のまま Sonnet 5。

途中で利用者が、検証の一式を走らせるのは verifier だけにすると決めた。
2 巡目の implementer は関係するテストだけを走らせた。

| 巡 | 担当 | 見たもの | 報告 |
|----|------|----------|------|
| 1 | implementer（Opus 5） | 実装一式 | [implementer-report.md](implementer-report.md) |
| 1 | verifier（Sonnet 5） | 属性の残り、6 つの検証、3 通りの破壊 | [verifier-report.md](verifier-report.md) |
| 1 | reviewer（Opus 5） | 変更前との判定と表示の照合、先行実行 | [reviewer-report.md](reviewer-report.md) |
| 2 | implementer（Opus 5、新しく起動） | CLAUDE.md の説明、足りないテスト 2 件 | implementer-report.md の「レビュー後の修正」 |
| 2 | verifier | 一式 1 回、前回落ちなかった 2 通りの破壊、CLAUDE.md | [verifier-report-2.md](verifier-report-2.md) |

2 巡目は文書とテストが中心で、コードは同じ意味の関数の呼び出しに置き換えた 1 か所だけなので、
レビューは挟まなかった。

振り返りは
[`archives/todo/TODO-052. 表示部品が持つ状態の写しをなくし、判定では gameinfo を読む.md`](../../todo/TODO-052.%20表示部品が持つ状態の写しをなくし、判定では%20gameinfo%20を読む.md)
にある。
