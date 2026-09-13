# TODO-046 の分担

座標の計算を `Board` から `layout.js` へ移す、見た目を変えない項目。
2 ファイルで実装は小さいので main が行い、レビューと確認を分けた。
`point_geometry()` で `if` の並びを書き直したので、レビューも入れた。

| 担当 | モデル | 見たもの | 報告 |
|------|--------|----------|------|
| reviewer | Sonnet 5 / effort high | 式の突き合わせ、部品を作る順番と引数、`layout.js` の import | [reviewer-report.md](reviewer-report.md) |
| verifier | Sonnet 5 / effort medium | `git worktree` で HEAD と今の版を並べ、ページの配置を値で突き合わせる | [verifier-report.md](verifier-report.md) |

振り返りは
[`archives/todo/TODO-046. Board のコンストラクタから配置を切り出す.md`](../../todo/TODO-046.%20Board%20のコンストラクタから配置を切り出す.md)
にある。
