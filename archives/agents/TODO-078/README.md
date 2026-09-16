# TODO-078 の分担

実装は main（Opus 5 / effort high）。差分が `src/ytbg/lobby.py` 1 ファイルで
小さいので、実装まで分けなかった。子プロセスの出力先が変わる（挙動が変わる）
項目なので、確認とレビューは分けた。

- **verifier**（Sonnet 5 / medium）— 検証の一式、わざと壊す確認、
  手で起動したボードと lobby 経由のボードの実プロセスでの確認。
  `verifier-report.md`
- **reviewer**（Sonnet 5 / high）— 規約と設計に照らしたレビュー。
  ファイルハンドルの寿命を重点的に見てもらった。`reviewer-report.md`

レビューの指摘（起動そのものが失敗したときにファイルが閉じられない）を
main が直したあと、verifier に差分だけを再確認させた。
`verifier-report.md` の末尾がその分。
