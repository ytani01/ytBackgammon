# TODO-072 の分担

| 担当 | 受け持ち |
|------|----------|
| main | `lobby.js` の `load()` と読み込みの順序、`allow="autoplay"`、`lobby.test.mjs` の変更、文書。reviewer の指摘の修正 |
| verifier | 検証の一式、壊してテストが落ちるかの確認（4 通り）、iframe の中の音の設定の実測 |
| reviewer | 読み込みの順序（2 回読まないか、listen 前に読まないか）、3 秒ごとの `fit_main()`、テストの確かさ、文書 |

## この分担にした理由

変更は `lobby.js` とテストが中心で小さいので、実装は main が行った。読み込みの条件分岐が
変わるので、規約どおり verifier に加えて reviewer も付けた。reviewer は順序の抜けを
探す担当なので Opus 5 に上書きした。

## 報告

- [verifier-report.md](verifier-report.md)
- [reviewer-report.md](reviewer-report.md)
