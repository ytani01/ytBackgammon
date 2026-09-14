# TODO-054 の分担

表示部品（`ui/` のクラス）に id ではなく要素を渡す項目。`dom.js`・`main.js`・`board.js`・
`ui/` のすべてのクラスにまたがるリファクタリングで、渡す要素の取り違えを照らす必要があるので、
実装・確認・レビューを分けた。

**実装とレビューは Opus 5 に上書きした**（TODO-050〜053 と同じ理由）。確認は定義のまま Sonnet 5。
検証の一式を走らせるのは verifier だけ。`CLAUDE.md` を直してよいことは最初の依頼に書いた
（TODO-053 の振り返り）。

| 巡 | 担当 | 見たもの | 報告 |
|----|------|----------|------|
| 1 | implementer（Opus 5） | 実装一式 | [implementer-report.md](implementer-report.md) |
| 1 | verifier（Sonnet 5） | id の残り、一式、3 通りの破壊、画像の読み込みの順番 | [verifier-report.md](verifier-report.md) |
| 1 | reviewer（Opus 5） | 68 か所の部品が変更前と同じ要素を受け取るか | [reviewer-report.md](reviewer-report.md) |
| 2 | implementer（Opus 5、新しく起動） | テストの穴 2 つ、コメントの書き方 | implementer-report.md の「レビュー後の修正」 |
| 2 | verifier | 一式、落ちなかった壊し方とプレーヤーの取り違え | [verifier-report-2.md](verifier-report-2.md) |

2 巡目はテストとコメントだけなので、レビューは挟まなかった。

振り返りは
[`archives/todo/TODO-054. 表示部品（ui_ のクラス）に id ではなく要素を渡す.md`](../../todo/TODO-054.%20表示部品（ui_%20のクラス）に%20id%20ではなく要素を渡す.md)
にある。
