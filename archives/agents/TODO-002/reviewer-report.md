# TODO-002 reviewer 報告

対象: `git diff -M d834035`（未コミット）の `src/ytbg/` 4 ファイル。
全ハンクを目視し、依頼文の 1〜7 をすべて確認した。

**結論: 挙動が変わる変更は見つからなかった。** 要修正は 1 件（コード外）。

---

## 要修正

### 1. `CLAUDE.md:32,49,52,110` — 改名後のファイル名に追随していない

改名で `src/ytbg/ytBackgammonServer.py` と `src/ytbg/ytBackgammon.py` は
存在しなくなったが、`CLAUDE.md`「構成」の節はこの名前のままになっている。

```
CLAUDE.md:49:- `src/ytbg/ytBackgammonServer.py` — サーバ側の中心。…
CLAUDE.md:52:- `src/ytbg/ytBackgammon.py` — `gameinfo`（盤面の状態そのもの）を…
```

- 根拠: 実際に grep して確認（`archives/` を除いた全ファイルで、旧名が
  残っているのは `CLAUDE.md` と `TODO.md` だけ）。`README.md`、
  `ytbg.sh` / `ytbg-boot.sh` / `ytbg-stop.sh`、`ytbg.html`、
  `webroot/` 以下の `.js` / `.html` に旧名の参照は **無い**（確認済み）
- なぜ問題か: 利用者全体の `CLAUDE.md` の「対で保守すべきものの片方だけが
  変わっていないか」に当たる。`CLAUDE.md` は起動のたびに読まれる現行仕様の
  文書なので、実在しないパスが残ると次の作業で誤る
- **implementer の責任ではない。** 依頼文で「触るな」とされた範囲であり、
  報告にも挙がっている。**TODO-002 を閉じる前に main が直すもの**
- 32 行目・110 行目の `MyLogger.get_logger()` はクラス名なので変更不要
  （クラス名は変えていない）。直すのは 49 行目と 52 行目のパスだけ

---

## 検討

### 2. `TODO.md:28-29` — TODO-002 の項目の記述が事実と違う

「`__class__` を調べる（mypy 1 件）。同じ書き方の `yt_backgammon.py` で
出ない理由が…」とあるが、**着手前から 2 件出ていた**。

- 根拠（実測）: `d834035` を worktree に取り出して `uv run mypy` を実行。

  ```
  src/ytbg/ytBackgammon.py:20: error: Name "__class__" is not defined
  src/ytbg/ytBackgammonServer.py:32: error: Name "__class__" is not defined
  ```

  33 件の内訳は `__class__` 2 ＋ `Any | None` 24 ＋ `__main__.py` 7
- implementer の原因分析（mypy がメソッド本体の暗黙の `__class__` セルを
  持っていない）も **再現して確認した**。最小例
  `class A: def __init__(self): __class__.x = 1` で同じエラーが出る
  （mypy 2.3.1）。ファイルやクラスとは無関係
- 判断: `CLAUDE.md`「書き方の慣習」が `__class__._log` を指定しているので、
  **残す**（implementer の判断に同意）。`# type: ignore` を足すのも、
  慣習に沿った書き方に注釈を付けて回ることになるので勧めない。
  `TODO.md` の該当行と完了条件（mypy 8 件 → 9 件）を直して閉じるのが良い

### 3. `yt_backgammon_server.py:359` — PLR2044 で消した空コメントは構造の区切りだった

消した 3 行（旧 364-366 行）は、`on_json()` の中で
「`return` で抜ける分岐群」と「`return` せず落ちていく分岐群」の
**境目**に置かれていた。

- 根拠: `set_gameinfo`（現 355-360 行）までは全分岐が `return` で終わり、
  `put_checker`（現 362 行）以降は 1 つも `return` しない。実際に
  `on_json()` 全体（312-426 行）を読んで確認した
- なぜ問題か: 挙動は変わらないが、「ここから下は fall-through」という
  唯一の目印が消えた。`CLAUDE.md`（利用者全体）は「なぜ」を書けと
  しているので、空コメントを消すだけでなく、
  `# ここから下は return せず、最後の add_history まで落ちる` のような
  中身のあるコメントに置き換えるのが良い
- 範囲外ならそのままでもよい（指摘の記録として残す）

### 4. `my_logger.py:68-69` — 統合後の条件に「なぜ 2 つ要るか」が書かれていない

```python
if (debug in (NOTSET, DEBUG, INFO, WARNING, ERROR, CRITICAL)
        or type(debug) == int):
```

一見すると後半が前半を含んでいるように読めるが、**どちらも必要**。

- 前半だけが拾うもの: `False`（`False == NOTSET` なので True になる）、
  `10.0` のような float
- 後半だけが拾うもの: `1`、`55`、`-1` のような生の int
- `type(debug) == int` を `isinstance` にしてはいけない理由は `TODO.md` に
  あるが、`TODO.md` は決着後 `archives/` へ移る。**コード側に残らない**
- なぜ問題か: 次に ruff や誰かが「冗長だ」と片方を消すと `debug=True` が
  `setLevel(True)`（= レベル 1）になる。1 行の「なぜ」コメントが要る

---

## 確認した項目（問題なし）

### A. SIM114 の分岐統合 — 挙動は同一（実測）

統合前後の条件を関数に切り出し、20 種類の値で結果を比較した。
**全件で同じ**（`setLevel` に渡る値も含めて一致）。

| `debug` | 統合前 | 統合後 |
|---|---|---|
| `True` | `setLevel(DEBUG)` | 同じ |
| `False` | `setLevel(False)` = NOTSET | 同じ |
| `0` / `NOTSET` | `setLevel(0)` | 同じ |
| `10`, `1`, `5`, `55`, `-1` | `setLevel(<値>)` | 同じ |
| `0.0`, `10.0` | `setLevel(<値>)` | 同じ |
| `3.5`, `nan` | `setLevel(DEBUG)` | 同じ |
| `None`, `''`, `[]`, `{}` | `setLevel(INFO)` | 同じ |
| `'DEBUG'`, `'debug'` | `setLevel(DEBUG)` | 同じ |
| `__eq__` が常に True のオブジェクト | `setLevel(<obj>)` | 同じ |

`type(debug) == int` は `isinstance` に **変わっていない**
（`my_logger.py:69` を目視）。`or` は短絡するが、統合前も
第 1 条件が偽のときだけ第 2 条件を評価していたので、評価順・回数も同じ。

### B. `_gameinfo` の型注釈 — 意味の変わる経路なし

`yt_backgammon.py:28` `self._gameinfo: dict[str, Any] = {}`。

- `_gameinfo` を `None` と比較している箇所、真偽判定している箇所は
  **コード全体に無い**（`yt_backgammon.py` / `yt_backgammon_server.py` /
  `__main__.py` を grep）。`yt_backgammon_server.py` からの
  `self._bg._gameinfo` は 15 箇所あるが、すべて添字アクセスか
  代入（56, 64-80, 110, 143, 184, 290, 358, 423 行）
- `__init__` 途中の例外: `{}` のまま残るのは `init_gameinfo()`（33-74 行）が
  例外を投げた場合だけだが、中身は `self.svr_ver` を埋めた dict リテラルと
  `_log.debug` で、失敗しようがない。仮に失敗しても、以前は `None` で
  `TypeError`、今は `{}` で `KeyError` になるだけで、どちらも到達しない
- `set_gameinfo()` / `load_data()` が入れるのは JSON 由来の dict なので
  `dict[str, Any]` と矛盾しない

### C. PLR1711 — 消した `return` は 2 つとも関数の末尾

- `backward_hist()`（現 157 行の直後）と `forward_hist()`（現 198 行の
  直後）。どちらも `self.save_data(self._datafile_path)` の次で、
  関数の最終行だった。**途中の早期 `return` は消していない**
- 関数本体（120-198 行）を全部読んで確認。途中の脱出は `while` の
  `break`（`if n > 0 and count >= n: break`）で、`return` ではない
- 両関数とも値を返さないので、戻り値も変わらない

### D. PTH123 — モード・エンコーディング・例外とも同じ（実測）

- `save_data()`: `open(path_name, "w")` → `Path(path_name).open("w")`。
  `load_data()`: `open(path_name)` → `Path(path_name).open()`。
  `Path.open` の既定値は `mode='r', buffering=-1, encoding=None,
  errors=None, newline=None` で組み込み `open` と同じ
- `Path(...)` の呼び出しは **どちらも `try:` の中**（256-257 行、
  278-279 行）。`Path()` 自身が投げても既存の `except Exception` が拾う
- 例外の型を実測で比較（`open` vs `Path().open()`）:

  | パス | `open` | `Path().open()` |
  |---|---|---|
  | 存在しないファイル | `FileNotFoundError` | 同じ |
  | ディレクトリ | `IsADirectoryError` | 同じ |
  | `HOME` 未設定時の `'None/ytbg-1.json'` | `FileNotFoundError` | 同じ |
  | `''`（空文字） | `FileNotFoundError` | `IsADirectoryError` |

  差が出るのは空文字だけ。`path_name` は全呼び出しで
  `self._datafile_path`（`f'{DATAFILE_DIR}/{DATAFILE_NAME}-{svr_id}.json'`）
  なので空にならず、仮になっても `except Exception` が拾って
  `load_data()` は `return 0, 0` を返す。**到達不能かつ同じ結果**
- `except Exception`（BLE001）は 2 箇所とも手つかず。`FileNotFoundError` の
  扱いも変わっていない

### E. shebang の削除 — 直接実行している箇所は無い

`my_logger.py` と `yt_backgammon_server.py` を直接実行する記述は、
`ytbg.sh`（`exec uv run ytbg "$@"`）、`ytbg-boot.sh`、`ytbg-stop.sh`
（`ps | grep 'python.*/bin/[y]tbg'`）、`README.md` の **どれにも無い**
（全文を読んで確認）。`docs/` はディレクトリごと存在しない。
実行権限も 3 ファイルとも 644 のまま（`ls -l` で確認）。
`__main__.py` の shebang と 755 は維持されている。

### F. 改名の漏れ — Python 以外にも無し

`archives/` を除く全ファイルを `MyLogger` / `ytBackgammon.py` /
`ytBackgammonServer.py` で grep。ヒットは
`CLAUDE.md`（要修正 1）、`TODO.md`（項目本文なので当然）、
`my_logger.py:50,78`（`class MyLogger` と `myLogger = MyLogger()` の
クラス名なので変更不要）だけ。`.sh` / `.html` / `.js` / `README.md` は 0 件。
`src/ytbg/__pycache__/` も新しい名前の `.pyc` だけで、旧名の残骸は無い。
`git mv` を使っているので `git diff -M` で rename として追える。

### G. 範囲 — はみ出しなし

- 差分は 4 ファイル、34 挿入 / 29 削除。**全ハンクを目視**し、
  依頼にある項目以外の変更は無かった
- 「やらないと決めた 3 種類」に手は入っていない（実測）:
  - UP031 17 件（`hist_ent2str()` 内）→ 残 17 件。差分にも現れていない
  - BLE001 2 件 → 残 2 件
  - `__main__.py` の `svr` → mypy 7 件が残ったまま。差分は import 2 行と
    `CONTEXT_SETTINGS` だけ
- ruff は 38 件 → **19 件**（UP031 17 ＋ BLE001 2）。
  mypy は 33 件 → **9 件**（`svr` 7 ＋ `__class__` 2）。いずれも実行して確認
- `pyproject.toml`、`webroot/`、`README.md`、`archives/` は未変更

### H. テスト

`CLAUDE.md` のとおりテストの仕組みが無いプロジェクトなので、
テストの追加は求めない。implementer が保存ファイルの
書き戻し diff（バイト一致）まで取っているのは、この差分に対しては妥当な
確認だと考える。

---

## 好みの範囲

### 5. `yt_backgammon.py:15` — `CONTEXT_SETTINGS` は使われていない

`dict()` → dict リテラルにした（C408）が、この定数は
`yt_backgammon.py` の中でも外でも参照されていない（click を使うのは
`__main__.py` だけ。grep で確認）。今回の範囲としては現状で正しい。
別項目で消すかどうか。

### 6. `__main__.py:103,104,107` — 78 桁を超えている

`pyproject.toml` の `line-length = 78` を超える行が 3 本（98/105/91 桁）。
**この差分で入ったものではなく TODO-001 由来**で、ruff の `E501` は
有効になっていないため指摘も出ない。記録として残すだけ。
