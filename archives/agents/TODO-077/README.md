# TODO-077 の分担

実装は main（Opus 5 / effort high）。差分が `__main__.py` と `app.py` の
2 ファイルで小さいので、実装まで分けなかった。

- **verifier**（sonnet / medium）— 検証の一式と、わざと壊す確認、
  実プロセスでの起動。`verifier-report.md`
- **reviewer**（sonnet / high）— 規約と設計に照らしたレビュー。
  `-i` の値の扱いで分岐が増えるので、確認とは別の目を入れた。
  `reviewer-report.md`

レビューの指摘（`''`・`.`・`..` の誤判定）を直したあと、verifier に
差分だけを再確認させた。`verifier-report.md` の末尾がその分。
