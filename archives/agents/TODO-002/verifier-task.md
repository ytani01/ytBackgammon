# TODO-002 verifier への依頼

## 目的

implementer の実装が指示どおりか、検証が通るかを確かめる。**何も直さない。**

## 読むもの

- `TODO.md` の「TODO-002」の節（範囲はこれが正）
- `archives/agents/TODO-002/implementer-task.md`（実装への依頼文）
- `archives/agents/TODO-002/implementer-report.md`（実装の報告）

**依頼文には誤りが 1 つある。** 「`yt_backgammon.py:20` では `__class__` の
エラーが出ていない」と書いてあるが、実際は最初から 2 件出ていた。
これは下の 3. で裏を取ること。

## 確かめること

### 1. 指摘の残件数

- `uv run ruff check .` — 残り 19 件で、内訳が UP031 17 件と BLE001 2 件だけか。
  **今回やらないと決めた 3 種類（UP031 の `hist_ent2str()` 内、BLE001、
  `__main__.py` の `svr`）以外が残っていないか**を、件数だけでなく
  出力の中身で確かめる
- `uv run mypy src` — 残り 9 件で、内訳が `__main__.py` の `svr` 7 件と
  `__class__` 2 件だけか

### 2. 改名が機械的な置換だけか

3 ファイルの改名（`MyLogger.py` / `ytBackgammon.py` / `ytBackgammonServer.py`）で、
**改名と、それに伴う import・docstring の書き換え以外のものが混ざっていないか。**
`git diff -M --stat` と `git diff -M` を読み、旧ファイルとの差分を 1 件ずつ見る。

あわせて、**旧ファイル名の参照が残っていないか**をリポジトリ全体で探す
（`archives/` は過去の記録なので除く。`CLAUDE.md` に残っているのは
範囲外として承知済みなので、報告に挙げるだけでよい）。

### 3. `__class__` が最初から 2 件だったかの裏取り

作業前の状態（コミット `d834035`）に戻して `uv run mypy src` を走らせ、
`__class__` のエラーが何件出るかを実際に見る。`git stash` か
`git worktree` を使い、**作業ツリーを壊さないこと**。確認後は必ず元に戻す。

### 4. 動くか

- `uv run ytbg --help` が動くか
- サーバが起動し、`/`、`/p1`、`/p2` が 200 を返すか。
  **利用者のサーバが 5001〜5004 で動いているので、そこは使わない。**
  空いているポート（5011 など）と、使っていない `server_id`（9 など）を使う。
  **利用者のサーバを止めないこと。** テスト後に自分の起動したものだけを、
  `pgrep` で PID を確かめてから kill する（`pkill` はパターンで自分の
  シェルを巻き込むので使わない）
- 起動時とアクセス時のログにトレースバックが出ていないか
  （切断時の `ConnectionError` は TODO-003 の既知の件なので除く）

### 5. 保存ファイルの中身が変わっていないこと

implementer は「`HOME` をスクラッチに向けて `~/ytbg-1.json` を読み込ませ、
`save_data()` で書き戻して diff がバイト単位で一致した」と報告している。
**これを自分で組み立て直して再現すること**（報告を読んで済ませない）。
`Path.open()` 化と f-string 化で保存の書式が変わっていないかの確認になる。

**本番の `~/ytbg-1.json` 〜 `~/ytbg-4.json` を書き換えないこと。**
必ずコピーを作り、`HOME` を差し替えた環境で試す。

### 6. 範囲

`git status` と `git diff -M --stat` を見て、変更されたファイルが
`src/ytbg/` の 4 ファイルと `archives/agents/TODO-002/` だけか。
`pyproject.toml`、`CLAUDE.md`、`README.md`、`src/ytbg/webroot/` が
変わっていたら報告する。

## 報告

`archives/agents/TODO-002/verifier-report.md`。走らせたコマンドと終了コードを
そのまま書く。落ちた箇所は出力を引用する。管理者への返事は 5 行以内。
