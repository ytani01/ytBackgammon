# TODO-035. LICENSE を置き、ファイル先頭の表記を揃える

|      | main | 担当 |
|------|------|------|
| 見込み | Sonnet 5 / effort medium | main + verifier |
| 実施 | Sonnet 5 / effort medium | main + verifier |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Sonnet 5 | medium | 11,926 | 98,130 | 84% |
| verifier | Sonnet 5 | medium | 4,925 | 42,431 | 16% |
| 合計 |  |  | 16,851 | 140,561 | 概算 $1.4 |

- verifier の定義ファイルは Haiku 系ではなく Sonnet 5 系で動いており、
  定義どおり（上書きなし）

## きっかけ

`pyproject.toml` に `license = "MIT"` と書いてあるのに `LICENSE` が無かった。
MIT はライセンス全文の同梱を条件にしているので、これだけは実害がある。

同じくファイルの先頭を見ていて、次の 2 つが出てきた。

- `__author__` / `__date__` はどこからも読まれていない。参照は
  `src/ytbg/__init__.py` の `__all__` に `'__author__'` が載っている
  1 箇所だけ。著者は `pyproject.toml` の `authors`、日付は git が
  持っているので二重管理になる。実際にメンテされておらず、`server.py` と
  `__main__.py` は TODO-025 で中身を書き直したあとも
  `__date__ = '2020/05'` のままだった
- コピーライトの年が揃っていなかった。`src/ytbg/mylog.py` だけ
  `(c) 2026` で、残りのファイルは年が無かった

年を 2020 にしたのは、著作権表示の 3 要素として定められている「年」が
**最初の発行の年**（17 U.S.C. § 401(b)(2)、万国著作権条約 3 条 1 項）
であり、このリポジトリの最初のコミットが 2020-04 だったため。改訂を
重ねるものは実質的な変更をした年を足していく実務もある（GNU の
maintainer 向け文書）が、1989-03-01 以降は米国でも表示そのものが
任意になっており、日本は無方式主義で表示に法的効果が無い。毎年の更新を
追うほどの意味は無いので、初版の年だけにした。

## やったこと

- `LICENSE` を新規作成（MIT の原文、`Copyright (c) 2020 Yoichi Tanibayashi`）
- `src/ytbg/` と `tests/` の .py ファイル（計 24 ファイル）で、
  先頭のコピーライト行を `# (c) 2020 Yoichi Tanibayashi` に統一
  （`mylog.py` の `(c) 2026` も含む）
- `src/ytbg/` の 12 ファイルから `__author__` / `__date__` を削除。
  `__init__.py` の `__all__` からも `'__author__'` を除いた
- 削除は対象の行だけをピンポイントで取り除く形にした。最初に
  正規表現で連続空行をまとめて圧縮する書き方をしたところ、削除とは
  無関係な「クラス/関数定義前の 2 行空白」まで 1 行に潰れてしまい、
  `git diff` で気づいて `src/ytbg/` を一度 `git checkout` で戻し、
  対象の行だけを消すやり方でやり直した

## 確かめたこと

- `uv run pytest -q` — 211 passed
- `uv run ruff check .` — All checks passed!
- `uv run mypy src` — Success: no issues found in 12 source files
- `uv run basedpyright` — 0 errors, 0 warnings, 0 notes
- verifier が独立に同じ 4 つのコマンドを実行し、いずれも終了コード 0 を確認
- `grep -rn "^# (c)" --include="*.py" src/ tests/` で 24 件すべてが
  `# (c) 2020 Yoichi Tanibayashi` に揃っていることを確認
- `grep -rn "__author__\|__date__" .`（`.venv/` `.git/` 除外）で、
  コード側（src/ytbg/、tests/、docs/、その他 .md）に実体としての
  参照が残っていないことを確認（ヒットしたのは `TODO.md` の本項目の
  説明文のみ）
- `git diff` の各ハンクを目視し、削除対象の行（コピーライト行の置換、
  `__author__` / `__date__` の削除）以外に余計な変更が無いことを確認

## 分担の振り返り

- verifier は、pytest/ruff/mypy/basedpyright の実行結果、grep による
  網羅確認、`git diff` の全ハンク目視による「余計な変更が無いこと」の
  確認を担当し、すべて main の作業内容と一致することを裏付けた
- 見込みどおりの規模・分担で収まった。main が一度作業をやり直す
  場面があったが、それは verifier に確認を依頼する前に自分の
  `git diff` チェックで気づいたもので、分担そのものの食い違いではない
- 次に同じ規模（ファイル横断の一括置換＋削除）の項目をやるなら、
  一括置換のスクリプトを書いた直後に `git diff` を必ず自分で
  ハンク単位で見てから verifier に渡す、という順序を最初から徹底する
