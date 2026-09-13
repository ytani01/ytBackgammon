# TODO-045 の分担

150 行の関数を 3 つに分ける、挙動を変えない項目。1 ファイルなので
実装は main が行い、レビューと確認を分けた。

**TODO-044 の反省から、reviewer を先、verifier をあとにした。**
reviewer には「ファイルを書き換えて試すときはスクラッチの複製で」と
依頼文で指定した。

| 担当 | モデル | 見たもの | 報告 |
|------|--------|----------|------|
| reviewer | Opus 5 / effort high | 挙動が変わっていないか、表どおりか、複製で 6 通り壊してテストの穴を探す | [reviewer-report.md](reviewer-report.md) |
| verifier | Sonnet 5 / effort medium | 範囲、4 つの検証、reviewer が見つけた穴を塞いだテストが効くか | [verifier-report.md](verifier-report.md) |

振り返りは
[`archives/todo/TODO-045. Checker.on_mouse_up_xy() を分ける.md`](../../todo/TODO-045.%20Checker.on_mouse_up_xy()%20を分ける.md)
にある。
