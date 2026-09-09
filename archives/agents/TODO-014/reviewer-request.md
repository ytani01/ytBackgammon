# TODO-014 レビューの依頼

## 目的

TODO-014「バージョンを git tag に連動させる」の差分を、規約と設計に照らして
レビューする。**コードは直さない。** 見つけたことを報告する。

## 前提として読むもの

- `TODO.md` の TODO-014 の節（決めたことと引っかかる点）
- `archives/agents/TODO-014/implementer-request.md`
- `archives/agents/TODO-014/implementer-report.md`
- `git diff`（未コミット。`CLAUDE.md` / `pyproject.toml` / `ytbg.js` /
  `index.html` / `uv.lock`）

## 見てほしいところ

動くかどうかは verifier が別に確かめている。こちらは**良いかどうか**を見る。

- **`pyproject.toml` の設定が意図どおりか。** `hatch-vcs` と
  `local_scheme = "no-local-version"` の組み合わせで、決めた表記
  （タグ上は `1.0.0`、進んだら `1.0.1.dev3`、ハッシュ無し）になるか。
  `version_scheme` を明示していないが、既定で問題ないか。
  `[tool.uv] cache-keys` の書き方は uv の仕様に合っているか
- **配布物で壊れないか。** git の無い環境（sdist / wheel からのインストール）で
  バージョンが取れるか。`[tool.hatch.build.targets.sdist]` の `exclude` と
  組み合わせて問題が出ないか
- **バージョン表示を 1 つにまとめたことの副作用。** `index.html` の
  `id="version"` を消したが、他から参照されていないか。`ytbg.js` の
  `name_el`（`id="name"`）はどうなっているか
- **保存ファイルへの影響。** `server_version` が `0.80` から
  `1.0.1.devN` のような形に変わる。`hist_ent2str()`（`yt_backgammon_server.py:209`）
  や読み込み側で、形式を仮定しているところがないか
- **`CLAUDE.md` への追記が、周りの書き方と揃っているか。**
  規約は `~/.claude/CLAUDE.md` とプロジェクトの `CLAUDE.md` にある
- 消し忘れ・書き漏らし（他に `0.80` や `0.96` が残っていないか）

## 報告

`archives/agents/TODO-014/reviewer-report.md` に書く。指摘は
「どこが・なぜ問題か・どうするとよいか」の形で、重い順に並べる。
問題が無ければ、見たうえで無かったと書く。**直さない。**

返事は「終わったか・報告ファイルのパス・判断が要る点」の 5 行以内にすること。
