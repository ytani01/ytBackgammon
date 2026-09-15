# TODO-071 の分担

| 担当 | 受け持ち |
|------|----------|
| main | `lobby.js` の `fit_main()`、`lobby.html` の `--main-scale`、`lobby.test.mjs` に 1 件、文書。reviewer の指摘の修正 |
| verifier | テストの実行、壊してテストが落ちるかの確認、3 つの大きさでの計測とスクリーンショット。修正後の再確認 |
| reviewer | 倍率の計算、呼ぶ時機、テストの確かさを見る |

## この分担にした理由

変更は 2 ファイルと小さいので、実装は main が行った。倍率を計算する処理が入り挙動が
変わるので、規約どおり verifier に加えて reviewer も付けた。reviewer は計算の抜けを
探す担当なので Opus 5 に上書きした。

## 報告

- [verifier-report.md](verifier-report.md)（末尾に修正後の再確認）
- [reviewer-report.md](reviewer-report.md)
