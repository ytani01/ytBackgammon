# TODO-023 の分担

## 編成

| 担当 | モデル | 範囲 |
|------|--------|------|
| main | Opus 5 / effort high | 削除の範囲を確かめ、`ytbg.js` と `index.html` から消す |
| verifier | Sonnet 5 / effort medium | 4 つのテストと、ブラウザでのメニュー・Sound の挙動 |

## 理由

- **実装の担当を分けなかった。** 消すだけで、複数のファイルにまたがるとは
  いえ機械的な削除。main で足りる。
- **verifier は定義のまま Sonnet 5。** テストを走らせて結果を報告する担当で、
  判断は要らない。
- **reviewer は入れなかった。** 分岐や条件式が変わらないため。
  ただし `window.open` の削除は挙動が変わるので、その確認を verifier の
  依頼文で最優先の項目として名指しした。

## 報告

- [`verifier-report.md`](verifier-report.md) — 4 つのテストの結果、ブラウザで
  見たこと、`window.open` を戻して遷移が起きることの逆確認

決着の記録は
[`archives/todo/TODO-023. デッドコードを消す.md`](../../todo/TODO-023.%20デッドコードを消す.md)。
