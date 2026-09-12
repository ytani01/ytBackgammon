# TODO-043 の分担

ルールの中心のロジックを `Board` / `RollButton` / `Checker` から
`rules/move.js` へ移す項目。**分岐の意味が変わりやすい**ので、
実装・確認・レビューを 3 つに分けた（`~/.claude/CLAUDE.md` のとおり）。

| 担当 | モデル | 見たもの | 報告 |
|------|--------|----------|------|
| implementer | Opus 5 / effort medium | 5 関数の移設、呼び出し元の書き換え、テスト 39 件の追加 | [implementer-report.md](implementer-report.md) |
| verifier | Sonnet 5 / effort medium | 範囲、6 つの検証コマンド、移す前との突き合わせ 3 点、指定した 3 通りの破壊 | [verifier-report.md](verifier-report.md) |
| reviewer | Opus 5 / effort high | 分岐の意味、`rules/` の約束、テストの押さえ漏れ | [reviewer-report.md](reviewer-report.md) |

implementer と reviewer は、定義の `sonnet` を Opus 5 に上書きした。

**reviewer が隔離したコピーで 9 通り壊し、4 通りが「落ちない」ことを
見つけた**のが今回の要点。振り返りは
[`archives/todo/TODO-043. JS のルール層に合法手の判定を移す.md`](../../todo/TODO-043.%20JS%20のルール層に合法手の判定を移す.md)
にある。
