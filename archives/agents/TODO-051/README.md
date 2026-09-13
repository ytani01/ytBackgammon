# TODO-051 の分担

クライアントの送信を `actions.js` にまとめ、1 つの操作を 1 通にし、
サーバから古い type を消す項目。`ui/` のほぼ全部と `board.js`、
サーバの 5 ファイル、ブラウザのテストの書き直しがまとめて要り、
ゲームの進み方が変わっていないかの判断も要るので、実装・確認・レビューを分けた。

**実装とレビューは Opus 5 に上書きした**（TODO-050 と同じ理由）。確認は定義のまま Sonnet 5。

| 巡 | 担当 | 見たもの | 報告 |
|----|------|----------|------|
| 1 | implementer（Opus 5） | 実装一式、22 通りの破壊 | [implementer-report.md](implementer-report.md) |
| 1 | verifier / reviewer | 利用上限で途中で止まり、報告なし | — |
| 1（再） | verifier（Sonnet 5） | チェックボックスごとの実装、6 つの検証、3 通りの破壊、保存ファイル | [verifier-report.md](verifier-report.md) |
| 1（再） | reviewer（Opus 5） | 変更前と操作ごとの照合、捨てる条件、音、先行実行 | [reviewer-report.md](reviewer-report.md) |
| 2 | implementer（Opus 5、新しく起動） | 壊れたファイルの扱い、足りない送信のテスト | implementer-report.md の「レビュー後の修正」 |
| 2 | verifier | 6 つの検証、2 通りの破壊 | [verifier-report-2.md](verifier-report-2.md) |
| 2 | reviewer | 入口の確かめがほかの経路を壊さないか | [reviewer-report-2.md](reviewer-report-2.md) |

2 巡目の implementer は、1 巡目の会話を再開せずに新しく起動し、報告ファイルを読ませた
（TODO-050 の振り返りに従った）。

振り返りは
[`archives/todo/TODO-051. 1 つの操作を 1 通で送り、送信を actions.js にまとめる.md`](../../todo/TODO-051.%201%20つの操作を%201%20通で送り、送信を%20actions.js%20にまとめる.md)
にある。
