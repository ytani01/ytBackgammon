# TODO-032 の分担

項目そのものの記録は
[`archives/todo/TODO-032. history フラグの付け方を見直す.md`](../../todo/TODO-032.%20history%20フラグの付け方を見直す.md)。

## なぜこの分担にしたか

履歴に積むかどうかの分岐が変わる項目で、**挙動が変わる**。
そのため確認（動くか）とレビュー（良いか）を別の担当に分けた。

| 担当 | モデル | 役割 |
|------|--------|------|
| implementer | Sonnet 5（定義のまま） | 実装。設計は main が決めて渡した |
| verifier | Sonnet 5（定義のまま） | 6 つの検証の実行と、わざと壊して落ちることの再現 |
| reviewer | Opus 5（定義の sonnet から上書き） | 規約と設計に照らしたレビュー |

reviewer を Opus にしたのは、分岐の意味が変わる項目だから
（`~/.claude/CLAUDE.md` の「挙動が変わる項目にはレビューの担当も入れる」）。

## 報告

- [implementer-report.md](implementer-report.md) — 実装と、差し戻し後の修正
- [verifier-report.md](verifier-report.md) — 検証の結果と、戻すと落ちることの再現
- [reviewer-report.md](reviewer-report.md) — 要修正 2 件（New Game が進む側を
  捨てない・`set_clock_limit` が保存されない）と、再レビュー

## 進め方で分かったこと

**同じ作業ツリーで担当を並行に走らせるときは、`git stash` を使わせないこと。**
verifier が「わざと壊して確かめる」ために stash を使い、その最中に reviewer が
差分を読んで混乱した。ファイルを直接書き換えて戻すか、
`git worktree add --detach` で別の作業ツリーを作らせる。
