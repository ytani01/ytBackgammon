# TODO-002 の分担

## 分担にした理由

3 ファイルの改名（import・docstring・文書に波及）と、ruff 19 件・mypy 25 件の
修正がまとまって要る項目なので、実装を分けた。

挙動が変わりうる変更を含むため、確認とは別にレビューも入れた。
`get_logger()` の分岐統合（SIM114）、`bool` と `int` の扱い、`_gameinfo` の
型注釈は、「ruff が通ったか」を見ても意味が変わったことは捕まえられない。

| 担当 | モデル | 役割 |
|------|--------|------|
| implementer | Opus 5（定義は sonnet） | 改名・ruff 修正・mypy 型注釈 |
| reviewer | Opus 5（定義は sonnet） | 挙動が変わりうる点を差分で見る |
| verifier | Sonnet 5（定義のまま） | 指摘の残件数、起動、保存内容が変わらないこと |

`CLAUDE.md` と `TODO.md` の更新は main が行う（implementer は文書を触らない）。

## 報告

- [implementer](implementer-report.md)
- [verifier](verifier-report.md)
- [reviewer](reviewer-report.md)
