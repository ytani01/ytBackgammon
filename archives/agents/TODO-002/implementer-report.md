# TODO-002 implementer 報告

## 変更したファイル

### 改名（`git mv`。中身は下記のとおり別途修正）

- `src/ytbg/MyLogger.py` → `src/ytbg/my_logger.py`
- `src/ytbg/ytBackgammon.py` → `src/ytbg/yt_backgammon.py`
- `src/ytbg/ytBackgammonServer.py` → `src/ytbg/yt_backgammon_server.py`

改名後に `src/ytbg/__pycache__/` を削除した。クラス名（`MyLogger` /
`ytBackgammon` / `ytBackgammonServer`）は変えていない。実行権限も変えていない
（3 ファイルとも 644 のまま。`__main__.py` だけ 755 で shebang も残した）。

### `src/ytbg/my_logger.py`

- 1 行目: shebang `#!/usr/bin/env python3` を削除（EXE001）
- docstring 5 行目: `MyLogger.py` → `my_logger.py`
- docstring 9 行目（使用例）: `from .MyLogger import ...` → `from .my_logger import ...`
- 37-45 行: `from logging import ...` 2 行を `ruff check --fix` が 1 つの
  括弧付き import に整理（I001）
- 67-69 行: `get_logger()` の 2 分岐を `or` で統合（SIM114）。
  `type(debug) == int` はそのまま残した（`isinstance` にしない）

### `src/ytbg/yt_backgammon.py`

- docstring 5 行目: `ytBackgammon.py` → `yt_backgammon.py`
- 10-13 行: `from typing import Any` を追加、`from .my_logger import get_logger` へ変更
- 15 行: `CONTEXT_SETTINGS = dict(...)` → dict リテラル（C408）
- 28 行: `self._gameinfo = None` → `self._gameinfo: dict[str, Any] = {}`（mypy 24 件）。
  直後の `init_gameinfo()` が必ず上書きするので、値としての挙動は変わらない。
  `_gameinfo is None` を見ている箇所はコード中に無いことを確認した

### `src/ytbg/yt_backgammon_server.py`

- 1 行目: shebang を削除（EXE001）
- docstring 5 行目: `ytBackgammon.py`（誤記）→ `yt_backgammon_server.py`
- 14 行: `from pathlib import Path` を追加
- 18-19 行: import を `.my_logger` / `.yt_backgammon` へ変更
- 41-42 行: `_datafile_path` を f-string へ（UP031 1 件）
- 53 行: `fwd_hist_len` → `_fwd_hist_len`（RUF059）
- 155 行付近・196 行付近: `backward_hist()` / `forward_hist()` 末尾の
  裸の `return` を削除（PLR1711 2 件）
- 257 行: `open(path_name, "w")` → `Path(path_name).open("w")`（PTH123）
- 279 行: `open(path_name)` → `Path(path_name).open()`（PTH123）
- 362-364 行付近: 空コメント 3 行を削除（PLR2044）

### `src/ytbg/__main__.py`

- 19-20 行: import を `.my_logger` / `.yt_backgammon_server` へ変更
- 22 行: `CONTEXT_SETTINGS = dict(...)` → dict リテラル（C408）

`ruff check --fix` は使ったが `--unsafe-fixes` は使っていない。差分は
`git diff -M` で 1 件ずつ目視した。

## `__class__` の 1 件（mypy）について

**依頼文の前提が事実と違った。** `yt_backgammon.py`（旧 `ytBackgammon.py`）でも
同じエラーが出ている。作業開始時点の mypy 33 件の内訳は

```
src/ytbg/ytBackgammon.py:20: error: Name "__class__" is not defined  [name-defined]
src/ytbg/ytBackgammonServer.py:32: error: Name "__class__" is not defined  [name-defined]
```

の 2 件 ＋ `Any | None` 24 件 ＋ `__main__.py` の 7 件で、`__class__` は
最初から 2 件あった（依頼文は「`yt_backgammon.py:20` では出ていない」と
書いているが、そうなっていない）。

原因は mypy 側の未実装。メソッド本体の暗黙の `__class__` セル参照を mypy が
持っていないため、クラスに関係なく必ず出る。最小の再現でも同じ:

```python
class A:
    def __init__(self):
        __class__.x = 1   # error: Name "__class__" is not defined
```

（mypy 2.3.1 で確認）

直す手は「`__class__._log` を明示的なクラス名 `ytBackgammon._log` に書き換える」
しかないが、`__class__._log` に入れるのは `CLAUDE.md` に明記された書き方で、
依頼でも「その書き方自体は変えない」とされているため **直さずに残した**。
`# type: ignore[name-defined]` を付ける手もあるが、指示に無いので入れていない。

したがって mypy の残りは **9 件**（`__main__.py` の `svr` 7 件 ＋ `__class__` 2 件）。
完了条件の「8 件」に対して 1 件多いのは、上記のとおり最初から 2 件あったため。

## 検証

すべてリポジトリのディレクトリ内で実行した。

| コマンド | 終了コード | 結果 |
|---|---|---|
| `uv run ruff check .` | 1 | 19 件（UP031 17 ＋ BLE001 2）。完了条件どおり |
| `uv run mypy src` | 1 | 9 件（`svr` 7 ＋ `__class__` 2）。上記参照 |
| `uv run ytbg --help` | 0 | usage が出る |
| `./ytbg.sh -d -p 5011 -i images1a 9` ＋ `curl http://localhost:5011/` | 0 | HTTP 200。`/p1` も 200。トレースバック無し |

`ruff check .` / `mypy src` は残りの指摘があるので終了コードは 1 になる
（今回やらないと決めた分）。

### ポートを 5011 にした理由

作業開始時点で利用者のサーバが 5001〜5004 で既に動いていた
（PID 351683 ほか、`images2` などで起動中）。5001 で起動すると
`Address already in use` で落ちるため、空いている 5011 を使った。
利用者のサーバは止めていない（作業後も 4 プロセスとも動いていることを確認）。

**注意: 動いている 4 プロセスは改名前のコードをロード済み。
変更を反映するには再起動が要る。**

### 保存ファイルの中身

1. 本番の `~/ytbg-1.json` は作業前にスクラッチへ退避し、作業後に `diff` を
   取って **差分なし**（終了コード 0）であることを確認した。
2. 保存の書式が変わっていないことは、`HOME` をスクラッチに向けた環境で
   `~/ytbg-1.json` のコピーを読み込ませ、`save_data()` で書き戻して
   `diff` を取った。**バイト単位で一致**（終了コード 0）。
   `Path.open()` 化と f-string 化の影響が無いことの確認になっている。
3. サーバの起動テストは `server_id` を 9 にしたので `~/ytbg-9.json` が
   新規に作られた。テスト後に削除済み（`~/` には `ytbg-1〜4.json` だけが残る）。

起動したテスト用サーバは `pgrep` で PID を確かめてから kill し、
停止を `pgrep` と `curl`（接続失敗）の両方で確認した。

## 判断が要る点・範囲外で気づいたこと

- **`__class__` の mypy 2 件**（上記）。残すか、`type: ignore` を付けるか、
  明示クラス名に変えるかは管理者の判断。個人的には残すのが良いと思う
  （`CLAUDE.md` の書き方の慣習を優先）
- **`CLAUDE.md` に旧ファイル名が残っている**（範囲外なので触っていない）。
  - 32 行目 `MyLogger.get_logger(name, debug)`
  - 49 行目 `src/ytbg/ytBackgammonServer.py`
  - 52 行目 `src/ytbg/ytBackgammon.py`
  - 110 行目 `MyLogger.get_logger()`
  改名したので、いずれ直す必要がある
- `my_logger.py` の `type(debug) == int` は ruff の E721 に該当しうるが、
  現状 E721 は有効になっていない（`pyproject.toml` の `extend-select` は
  `I, B, SIM, UP, PTH`）ので指摘は出ていない。`E` を足すと出る
- `yt_backgammon.py` の `CONTEXT_SETTINGS` はどこからも使われていない
  （click を使うのは `__main__.py` だけ）。今回は dict リテラルにするだけに
  留め、削除はしていない
- `pyproject.toml` は変えていない（変える必要は生じなかった）

## 追加対応（reviewer の指摘）

reviewer report の「検討」3・4 を受けて、コメントを 2 箇所足した。
**コメントだけで、コードは 1 文字も変えていない。**

### 1. `src/ytbg/yt_backgammon_server.py:362`

`if msg['type'] == 'put_checker':` の直前に 1 行足した。

```python
        # ここから下は return せず、末尾の add_history と broadcast まで落ちる
```

文言は `on_json()` の末尾（427-435 行）まで読んで確かめた。落ちた先で
実際に起きるのは次の 2 つ。

```python
        # append history or not
        if msg['history']:
            self.add_history(self._bg._gameinfo)

        # broadcast
        emit('json', msg, broadcast=True)
```

- `msg['history']` が真のときだけ `add_history()` が呼ばれる（無条件ではない）
- `emit('json', msg, broadcast=True)` は**条件なしで必ず実行される**。
  受け取った `msg` をそのまま全クライアントへ転送する

reviewer の「最後の add_history まで落ちる」は、`add_history()` が
`msg['history']` 次第であること、その後に必ず broadcast があることが
落ちているので、コメントには両方を書いた。

なお、`return` する側の分岐（`back`〜`set_gameinfo`）は broadcast を通らず、
`backward_hist()` / `forward_hist()` / `emit_gameinfo()` が自前で
emit している。これがこの境目の意味になっている。

### 2. `src/ytbg/my_logger.py:68-70`

`get_logger()` の統合した条件の直前に 3 行足した。

```python
        # 後半は 1 や 55 のような生の int を拾うために要る（前半だけでは
        # 足りない）。isinstance にはしないこと。bool が int 扱いになり、
        # debug=True が setLevel(True) (= レベル 1) になってしまう
```

依頼は「2 行程度」だったが、2 点を 78 桁に収めると 3 行になった。

### 検証

| コマンド | 終了コード | 結果 |
|---|---|---|
| `uv run ruff check .` | 1 | 19 件のまま（UP031 17 ＋ BLE001 2）。増減なし |
| `uv run mypy src` | 1 | 9 件のまま。増減なし |
| `uv run python -c "import ytbg.yt_backgammon_server, ytbg.my_logger"` | 0 | import できる |

サーバの起動確認は依頼のとおり省いた。
