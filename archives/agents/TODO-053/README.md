# TODO-053 の分担

`Board` からドラッグ（`drag.js`）と設定（`settings.js` の `Settings`）を切り出す項目。
`board.js`・`ui/`・`actions.js`・`rules/`・`main.js` と `tests/browser/` にまたがる
リファクタリングで、動きが変わっていないかの照合が要るので、実装・確認・レビューを分けた。

**実装とレビューは Opus 5 に上書きした**（TODO-050〜052 と同じ理由）。確認は定義のまま Sonnet 5。
検証の一式を走らせるのは verifier だけ（TODO-052 の途中で利用者が決めた）。

| 巡 | 担当 | 見たもの | 報告 |
|----|------|----------|------|
| 1 | implementer（Opus 5） | 実装一式 | [implementer-report.md](implementer-report.md) |
| 1b | implementer（Opus 5、新しく起動） | キューブの判定を actions.js へ、ドラッグ中の gameinfo のテスト、CLAUDE.md | implementer-report.md の「残りの修正」 |
| 1 | verifier（Sonnet 5） | 属性の残り、一式、3 通りの破壊 | [verifier-report.md](verifier-report.md) |
| 1 | reviewer（Opus 5） | 変更前との動きの照合、依存の向き | [reviewer-report.md](reviewer-report.md) |
| 2 | implementer（Opus 5） | 利用上限で途中で止まった（`drag.js` の直しまで） | — |
| 2（再） | implementer（Opus 5、新しく起動） | 同時に掴んだときのテスト、import の循環、テストの穴 2 つ | implementer-report.md の「レビュー後の修正」 |
| 2 | verifier | 壊した変更の残り、一式、2 通りの破壊 | [verifier-report-2.md](verifier-report-2.md) |
| 2 | reviewer | 掴んだ位置の持ち方、`?sound` の効き方 | [reviewer-report-2.md](reviewer-report-2.md) |

振り返りは
[`archives/todo/TODO-053. Board からドラッグと設定を切り出す.md`](../../todo/TODO-053.%20Board%20からドラッグと設定を切り出す.md)
にある。
