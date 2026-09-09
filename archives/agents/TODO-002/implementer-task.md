# TODO-002 implementer への依頼

## 目的

`uv run ruff check .` と `uv run mypy src` の指摘のうち、**安全に直せるものだけ**を
解消する。挙動が変わりうるものは今回やらないと決めてある。

範囲は `TODO.md` の「TODO-002」の節が正。着手前に読むこと。

## 対象範囲

`src/ytbg/` の Python 4 ファイルだけ。

**触らないもの**: `TODO.md`、`CLAUDE.md`、`README.md`、`archives/`、
`src/ytbg/webroot/` 以下、`pyproject.toml`。
`pyproject.toml` を変える必要が出たら、変えずに報告へ書くこと。

## やること

### 1. モジュール名を snake_case にする（N999 3 件）

`git mv` で改名する（`mv` はエイリアスの影響を受けるので使わない）。

- `src/ytbg/MyLogger.py` → `src/ytbg/my_logger.py`
- `src/ytbg/ytBackgammon.py` → `src/ytbg/yt_backgammon.py`
- `src/ytbg/ytBackgammonServer.py` → `src/ytbg/yt_backgammon_server.py`

あわせて直すもの:

- import 6 箇所（`__main__.py`、`yt_backgammon.py`、`yt_backgammon_server.py`、
  `my_logger.py` の docstring 内の使用例）
- 各ファイル先頭の docstring に書いてあるファイル名。
  なお `ytBackgammonServer.py` の docstring は `ytBackgammon.py` と誤記して
  いるので、`yt_backgammon_server.py` に直す

**クラス名（`MyLogger` / `ytBackgammon` / `ytBackgammonServer`）と、
プロジェクト名の `ytBackgammon` は変えない。** 変えるのはファイル名だけ。
`__pycache__` に古い `.pyc` が残るので、改名後に消しておくこと。

### 2. 機械的に直せるもの

I001（2 件）、PLR2044（3 件）、C408（2 件）、PLR1711（2 件）、RUF059（1 件）。
`ruff check --fix` で直るものは使ってよいが、**`--unsafe-fixes` は使わない**。
差分は 1 件ずつ目で確かめること。

### 3. shebang を消す（EXE001 2 件）

`my_logger.py` と `yt_backgammon_server.py` は import 専用なので、1 行目の
`#!/usr/bin/env python3` を消す。**`chmod +x` はしない。**
`__main__.py` の shebang は残す（指摘が出ていない）。

### 4. `open()` を `Path.open()` にする（PTH123 2 件）

`yt_backgammon_server.py` の `load_data()` / `save_data()`。

### 5. `get_logger()` の 2 分岐を統合する（SIM114 1 件）

`my_logger.py` の

```python
if debug in (NOTSET, DEBUG, INFO, WARNING, ERROR, CRITICAL):
    logger.setLevel(debug)
elif type(debug) == int:
    logger.setLevel(debug)
```

を `or` でひとつにする。

**`type(debug) == int` を `isinstance(debug, int)` に変えないこと。**
`bool` は `int` のサブクラスなので、`isinstance` にすると `debug=True` が
この分岐に入り、`setLevel(True)`（= レベル 1）になって挙動が変わる。
いまは `type(True)` が `bool` なので下の `elif debug:` に落ちて `DEBUG` になる。

### 6. `_datafile_path` の組み立てを f-string にする（UP031 1 件）

`yt_backgammon_server.py:41` の `'%s/%s-%s.json' % (...)` だけ。
**`hist_ent2str()` の中の UP031（17 件）は触らない。** 保存ファイルの中身
そのもので、今回の範囲外。

### 7. `_gameinfo` に型注釈を付ける（mypy 24 件）

`yt_backgammon.py` の `self._gameinfo = None` が原因で
`Value of type "Any | None" is not indexable` が出ている。
型注釈で解消する。**`init_gameinfo()` の中身と、外から
`self._bg._gameinfo[...]` で読み書きしている箇所の挙動は変えない。**

### 8. `__class__` の 1 件を調べる（mypy 1 件）

`yt_backgammon_server.py:32` で `Name "__class__" is not defined` が出る一方、
まったく同じ書き方の `yt_backgammon.py:20` では出ていない。
**まず理由を調べて報告に書くこと。** 安全に直せると分かったら直す。
掴めなければ直さずに残し、分かったところまでを報告に書く。
`__class__._log` に入れるのはこのプロジェクトの決まり（`CLAUDE.md`）なので、
その書き方自体は変えない。

## 今回やらないもの（触るな）

- UP031 17 件（`hist_ent2str()` の中）
- BLE001 2 件（`load_data()` / `save_data()` の `except Exception`）
- mypy 7 件（`__main__.py` のグローバル `svr = None`）

## 完了条件

- `uv run ruff check .` の残りが **19 件**で、その内訳が UP031 17 件と
  BLE001 2 件だけになっている
- `uv run mypy src` の残りが **7 件**（`__main__.py` の `svr`）。
  `__class__` の 1 件を直せなかった場合は 8 件で、その理由が報告にある
- `uv run ytbg --help` が動く
- `./ytbg.sh -d -p 5001 -i images1a 1` でサーバが起動し、`curl` で
  トップページが引ける

## 検証

上の完了条件をすべて実際に走らせ、コマンドと終了コードを報告に書く。
サーバはテスト後に必ず止めること（`pkill` はパターンで自分のシェルを
巻き込むので、`pgrep` で PID を確かめてから kill する）。

**保存ファイルの中身が変わっていないことも確かめる。**
起動前に `~/ytbg-1.json` を退避しておき、起動・終了後のものと `diff` を取る。

## 報告

`archives/agents/TODO-002/implementer-report.md`。
管理者への返事は 5 行以内。
