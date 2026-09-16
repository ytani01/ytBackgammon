# TODO-076 の分担

置き場所の解決は `src/` の複数のファイル（`paths.py`・`__main__.py`・
`server.py`・`app.py`・`lobby.py`・`storage.py`）とテスト・文書に
またがるので、実装・確認・レビューを分けた。

- **implementer**（Opus 5 に上書き）— 実装とテストと文書。
  1 巡目で全体を作り、reviewer の指摘を受けた 2 巡目で 5 件を直した。
  2 巡目の途中でレート制限に当たって切れたが、修正自体は入っていた
- **verifier**（定義のまま Sonnet 5 / medium）— 検証の一式と、
  実プロセスでの起動確認、わざと壊して狙ったテストが落ちるかの確認。
  1 巡目（`verifier-report.md`）と 2 巡目（`verifier-report-2.md`）
- **reviewer**（Opus 5 に上書き）— 分岐と条件式の意味が変わった箇所、
  環境変数の書き換え、過剰実装の有無

`board` の `--port` / `--image_dir` の既定を `None` に変える、
設定ファイルを読む条件が増える、という**分岐の意味が変わる項目**なので、
確認の担当とは別にレビューの担当も入れた（`~/.claude/CLAUDE.md`）。

## 報告

- [implementer](implementer-report.md)
- [verifier（1 巡目）](verifier-report.md)
- [verifier（2 巡目）](verifier-report-2.md)
- [reviewer](reviewer-report.md)

振り返りは
[`archives/todo/TODO-076. …`](../../todo/TODO-076.%20置き場所を%20%60~/.ytbg/%60%20に統一し、CLI・環境変数・設定ファイルで変えられるようにする.md)
にある。
