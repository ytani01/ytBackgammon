# TODO-055 の分担

サーバの細かい修正（保存先を作るときに読む、`None` の分岐と `_cur_sn` を消す、
`load_data()` の戻り値、docstring）と、`docs/Developer.md` の書き直し、
`docs/design.md` を archives へ移す項目。

見込みどおり、**実装は main が行い**、確認とレビューを分けた。変更は小さいが、
`load_data()` の戻り値と、テストが利用者の `~/ytbg-*` を読み書きしないことに
関わるので、レビューも入れた。レビューは `Developer.md` の書き直しが今の実装と
合っているかも見るので Opus 5 に上書きした。確認は定義のまま Sonnet 5。

| 巡 | 担当 | 見たもの | 報告 |
|----|------|----------|------|
| 1 | verifier（Sonnet 5） | チェックボックス、一式、`~/ytbg-*` の更新時刻、3 通りの破壊 | [verifier-report.md](verifier-report.md) |
| 1 | reviewer（Opus 5） | `load_data()` の判断、保存先の抜け道、`Developer.md` | [reviewer-report.md](reviewer-report.md) |
| 2 | verifier | Python の検証、足したテストの破壊、指摘との対応 | [verifier-report-2.md](verifier-report-2.md) |

レビューが「保存先を import のときに読む形に戻すと、テストが本物の `$HOME` に書く」と
見つけたとき、確認の担当はちょうどその形に壊して試しているところだった。
途中で「`HOME` も一時ディレクトリにする」と伝えた。利用者の `~/ytbg-*` の更新時刻は
変わっていなかった。

振り返りは
[`archives/todo/TODO-055. サーバの細かい修正をまとめて行う.md`](../../todo/TODO-055.%20サーバの細かい修正をまとめて行う.md)
にある。
