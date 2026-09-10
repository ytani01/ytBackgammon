# TODO-019 の分担

| 担当 | 依頼 | 報告 |
|------|------|------|
| verifier | [verifier-request.md](verifier-request.md) | [verifier-report.md](verifier-report.md) |
| reviewer | [reviewer-request.md](reviewer-request.md) | [reviewer-report.md](reviewer-report.md) |

実装は main（Opus 5 / effort high）が持った。1 ファイル 30 行ほどの
追加で、実装の担当まで分けるほどの規模ではないと判断したため。

**確認とレビューは分けた。** 挙動が変わる項目（`on_json()` に分岐が
増え、連続再生の Task との競合が絡む）なので、「動くか」を見る
verifier とは別に、「良いか」を見る reviewer を立てた。

verifier には 2 回依頼している。1 回目は実装のあと、2 回目は
reviewer の指摘 4 件を反映したあと。2 回目は `SendMessage` で同じ担当を
再開したので、1 回目に読んだファイルを読み直させずに済んだ。

振り返り（何を見つけたか、次にどう組むか）は
[`archives/todo/TODO-019. 履歴を削除する機能をメニューから使えるようにする.md`](../../todo/TODO-019.%20履歴を削除する機能をメニューから使えるようにする.md)
の「分担の振り返り」にある。
