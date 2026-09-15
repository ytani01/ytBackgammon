# TODO-070 の分担

| 担当 | 受け持ち |
|------|----------|
| main | `lobby.html` の `body` から `width: 920px;` を消す |
| verifier | `lobby.test.mjs` を走らせ、幅 1920px と 600px で並び方を計測し、スクリーンショットを撮る |

## この分担にした理由

変更は CSS の 1 行なので、実装の担当は分けなかった。コードを変える項目なので
確認は規約どおり verifier に分けた。条件分岐は変わらないので reviewer は入れなかった。

## 報告

- [verifier-report.md](verifier-report.md)
