# TODO-002 verifier 報告

## 1. 指摘の残件数

- `uv run ruff check .` → 終了コード 1、**19 件**。内訳を出力の中身で確認:
  `UP031` 17 件（すべて `yt_backgammon_server.py` の `hist_ent2str()` 内の
  行、203〜224 行）、`BLE001` 2 件（`save_data()` 259 行、`load_data()`
  281 行の `except Exception`）。それ以外の指摘は無い。完了条件どおり。
- `uv run mypy src` → 終了コード 1、**9 件**。内訳:
  `__main__.py` の `svr` 関連 7 件（47, 53, 59, 64, 70, 75, 81 行、いずれも
  `"None" has no attribute ...`）、`__class__` 2 件
  （`yt_backgammon.py:23`、`yt_backgammon_server.py:32`）。
  それ以外の指摘は無い。

## 2. 改名が機械的な置換だけか

`git status` は 3 ファイルとも `renamed` と認識している。
`git diff -M --stat`:

```
 src/ytbg/__main__.py                               |  6 +++---
 src/ytbg/{MyLogger.py => my_logger.py}             | 23 ++++++++++++++--------
 src/ytbg/{ytBackgammon.py => yt_backgammon.py}     | 11 +++++++----
 ...BackgammonServer.py => yt_backgammon_server.py} | 23 +++++++++-------------
 4 files changed, 34 insertions(+), 29 deletions(-)
```

`git diff -M` の中身（199 行）を 1 件ずつ確認した。含まれるのは
- import・docstring の書き換え（改名に伴うもの）
- 依頼にある機械的な指摘の修正（shebang 削除、`dict()` → リテラル、
  空コメント削除、裸の `return` 削除、`fwd_hist_len` → `_fwd_hist_len`、
  `open()` → `Path.open()`、f-string 化、`SIM114` の統合、
  `_gameinfo` の型注釈）

以外は無かった。改名と無関係な挙動変更は見当たらない。

**旧ファイル名の参照**（`archives/` 除く）:
`CLAUDE.md` の 4 箇所（32, 49, 52, 110 行）に `MyLogger.get_logger`、
`ytBackgammonServer.py`、`ytBackgammon.py` が残っている。依頼の範囲外と
承知済みなので報告のみ。`src/`・`README.md`・`pyproject.toml` 等、
他に旧ファイル名の参照は無かった（`my_logger.py` 内の `class MyLogger` /
`myLogger = MyLogger()` はクラス名・変数名で、改名対象外なので問題ない）。

## 3. `__class__` が最初から 2 件だったかの裏取り

`git worktree add <scratch>/todo002-check d834035` で作業ツリーを汚さず
作業前コミットを取り出し、`uv run mypy src` を実行した結果:

```
src/ytbg/ytBackgammon.py:20: error: Name "__class__" is not defined  [name-defined]
...
src/ytbg/ytBackgammonServer.py:32: error: Name "__class__" is not defined  [name-defined]
...
Found 33 errors in 3 files (checked 5 source files)
```

**`__class__` は最初から `ytBackgammon.py:20` と `ytBackgammonServer.py:32`
の 2 件出ていた。** 依頼文の「`yt_backgammon.py:20` では出ていない」という
前提は誤りで、implementer の報告（「依頼文の前提が事実と違った」）は正しい。
確認後 `git worktree remove --force` で削除し、`git worktree list` で
作業ツリーが元通り（本体のみ）であることを確認した。

## 4. 動くか

- `uv run ytbg --help` → 終了コード 0、usage が出力された。
- 利用者のサーバ（5001〜5004、`server_id` 1〜4）はそのまま。
  空きポート 5012・未使用の `server_id` 9 で
  `./ytbg.sh -d -p 5012 -i images1a 9` を起動し、
  `curl -o /dev/null -w '%{http_code}'` で `/`=200、`/p1`=200、`/p2`=200 を確認。
- 起動ログ・アクセスログにトレースバックは無い（`WARNING`
  `FileNotFoundError` は初回起動時の想定内のもの）。
- テスト後 `pgrep -af "ytbg -d -p 5012"` で PID（uv のラッパーと実体の
  2 つ）を確認して `kill`。停止後 `pgrep` で確認済み。
  利用者のサーバ 4 プロセス（PID 351683 ほか）はテスト前後で変わらず
  稼働していることを確認した。テストで新規に作られた `~/ytbg-9.json` は
  `\rm` で削除済み。`~/` には `ytbg-1〜4.json` のみが残る。

## 5. 保存ファイルの中身が変わっていないこと

implementer の報告を鵜呑みにせず、自分で再現した。

- `~/ytbg-1.json` をスクラッチの `HOME` 用ディレクトリへコピー
  （`\cp`）。
- 最初 `HOME=<scratch> uv run python3 ...` で試したところ、`uv` 経由だと
  `mise` が実 `HOME` 側の信頼設定を見に行き `mise ERROR ... not trusted`
  で **落ちて何も実行されなかった**（気づかず進めると「差分無し」に
  見えてしまう罠だった）。`.venv/bin/python3` を直接使う形に変えて
  回避した。
- `HOME=<scratch> .venv/bin/python3 -c "svr = ytBackgammonServer(...); svr.save_data(svr._datafile_path)"`
  を実行し、`DONE` が出力されたこと（実際に書き戻されたこと）を確認。
- `diff <scratch>/ytbg-1.json ~/ytbg-1.json` → 差分無し（終了コード 0）。
  `md5sum` も両者一致（`e0f0f2e55888082d2ad1107c1966012f`）。
- 本番の `~/ytbg-1.json` は今回のテストでは読み込み専用のコピー元
  としてのみ使い、書き換えていない（`md5sum` で作業前後の一致を確認）。

`Path.open()` 化と f-string 化で保存の書式は変わっていないことを、
自分の手で再現して確認した。

## 6. 範囲

`git status` / `git diff -M --stat`:
変更は `src/ytbg/__main__.py`（変更）、`src/ytbg/MyLogger.py` →
`my_logger.py`、`src/ytbg/ytBackgammon.py` → `yt_backgammon.py`、
`src/ytbg/ytBackgammonServer.py` → `yt_backgammon_server.py`（いずれも
rename + 変更）、未追跡の `archives/agents/TODO-002/` のみ。
`pyproject.toml`、`CLAUDE.md`、`README.md`、`src/ytbg/webroot/` は
変更されていない。範囲どおり。

## 確かめられなかったこと・判断が要る点

- ブラウザでの実際の操作（駒を動かす、履歴を戻す等）までは確認していない。
  今回の変更が挙動に影響する分岐（`get_logger()` の統合、`hist_len`/`_fwd_hist_len`
  の変数名、`return` 削除）は静的には安全に見えるが、実機での UI 操作の
  確認は行っていない。
- `__class__` の 2 件を残すか `type: ignore` にするか等の判断は、
  implementer の報告にもあるとおり管理者の判断事項。verifier からは
  「最初から 2 件あった」という事実確認のみ行った。

## 追加分の再確認

reviewer の指摘を受けた implementer の追加コメント 2 箇所
（`yt_backgammon_server.py:362`、`my_logger.py:68-70`）を確認した。

### 1. コメント行だけで、実行されるコードが変わっていないか

目視でなく機械的に確認した。`tokenize` でコメント・改行・空行トークンを
除いた「コード相当行」の集合を、現在の 2 ファイルと、追加された行だけを
文字列置換で取り除いて再構成した「追加前」の 2 ファイルとで比較した。

```
src/ytbg/yt_backgammon_server.py identical after stripping comments/blank: True 284 284
src/ytbg/my_logger.py identical after stripping comments/blank: True 40 40
```

両ファイルとも、コメント・空行を除いた行が完全に一致（行数・内容とも同一）。
**追加されたのはコメント行のみで、実行コードは 1 文字も変わっていない。**
（作業に使ったスクラッチファイルは確認後に削除済み。）

### 2. ruff / mypy の件数

- `uv run ruff check .` → 終了コード 1、**19 件のまま**（末尾
  `Found 19 errors.`）
- `uv run mypy src` → 終了コード 1、**9 件のまま**（末尾
  `Found 9 errors in 3 files`）

増減なし。

### 3. `yt_backgammon_server.py:362` のコメントの中身

`on_json()` を 312〜427 行まで実際に読んで確認した。362 行のコメント

```python
        # ここから下は return せず、末尾の add_history と broadcast まで落ちる
```

の直後（363〜420 行）は `put_checker` 以降の各 `if` に `return` が無く、
すべて素通りして 422〜427 行に落ちる。

```python
        # append history or not
        if msg['history']:
            self.add_history(self._bg._gameinfo)

        # broadcast
        emit('json', msg, broadcast=True)
```

「`msg['history']` が真のときだけ `add_history()`」「そのあと無条件で
broadcast」という読み方と実際の分岐が一致している。コメントの内容は
正確。

### 範囲外で気づいたこと

`git status` で `CLAUDE.md` が変更されていた（`ytBackgammonServer.py` /
`ytBackgammon.py` の記述を `yt_backgammon_server.py` / `yt_backgammon.py`
に直す差分）。implementer-report の「追加対応」節には記載が無く、
今回の依頼（コメント 2 箇所）にも含まれていない。誰がいつ変更したかは
確認できていない。CLAUDE.md は TODO-002 implementer-task.md で「触らない
もの」に明記されているファイルなので、報告のみ行い判断は管理者に委ねる。
