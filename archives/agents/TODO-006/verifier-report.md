# TODO-006 確認報告（verifier）

## 1. 検証コマンド

- `uv sync` → 正常終了（新規解決なし、既存環境のまま）
- `uv run pytest` → `10 passed`、終了コード 0
- `uv run ruff check .` → 19 件。`git stash -u` で変更前（この作業の
  差分を退避）に戻した状態でも同じ 19 件（内容も一致、末尾数十行を
  目視比較）。**新規指摘なし**
- `uv run mypy src` → 9 件。変更前と同じ 9 件（`src/` を変更していない
  ので当然一致）。`mypy src` は `tests/` を対象にしないコマンドなので
  テストコード自体は型検査していない（implementer の報告と同じ認識）

## 2. 変更ファイルの範囲

`git status` / `git diff --stat`:

```
 M pyproject.toml
 M uv.lock
?? archives/agents/TODO-006/
?? tests/
 pyproject.toml |  4 ++++
 uv.lock        | 63 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 67 insertions(+)
```

指示どおり `pyproject.toml`（pytest 追加、`[tool.pytest.ini_options]`）、
`uv.lock`、`tests/` 配下の新規 4 ファイルのみ。`src/` は変更なし
（後述のミューテーションテスト後も `git checkout -- src/...` 不要な
状態、`git status --short` で `src/` の変更ゼロを確認済み）。

**指示範囲外の未実施項目**: `TODO.md` の TODO-006 節にある
「`CLAUDE.md` の『テストの仕組みは無い』を実態に合わせて直す」は、
implementer 報告・実際のファイルとも手を付けていない
（`CLAUDE.md:44` に「テストの仕組みは無い。」がそのまま残っている）。
これは verifier への依頼範囲（変更されたものの一覧）には含まれて
いなかったが、TODO 項目のチェックリストとしては未達成。

## 3. ミューテーションテスト（src を壊して、狙ったテストだけが落ちるか）

いずれも `git checkout -- src/ytbg/...` で元に戻し、`git status --short`
で `src/` の差分ゼロを確認済み。

### (a) `put_checker()` の ID→player 計算を壊す

`yt_backgammon.py`: `player = int(ch_id / 100)` → `+ 1` を足す

```
.......F..
FAILED tests/test_yt_backgammon.py::test_put_checker_derives_player_from_id
1 failed, 9 passed
```

狙った 1 本だけが落ちた。

### (b) `backward_hist()` の `n < 0`（全戻し）の分岐を壊す

`yt_backgammon_server.py`: `if n > 0 and count >= n:` → `if count >= n:`
（`n>0` の条件を外す）

```
..F.......
FAILED tests/test_history.py::test_backward_hist_all
1 failed, 9 passed
```

補足: 先に `if n > 0` を `if n >= 0` に変えただけでは何も落ちなかった
（`n=-1` は `n>=0` も偽のままなので、この書き換えでは分岐の意味が
実質変わらない）。`if count >= n:` に変えて初めて有効な破壊になった。
狙った 1 本のみ落ちることを確認。

### (c) `hist_ent2str()` から `sn` の出力行を落とす

`yt_backgammon_server.py:203` の `j_str += '      "sn": %d,\n' % h['sn']`
を `pass` に置換

```
FAILED tests/test_history.py::test_hist_ent2str_contains_sn
FAILED tests/test_save_load.py::test_save_and_load_roundtrip
2 failed, 8 passed
```

2 本落ちたが、どちらも `sn` の有無に依存するテストで、狙いどおり
（`test_hist_ent2str_contains_sn` は文字列に `"sn"` があるか、
`test_save_and_load_roundtrip` は保存 → 読み込みの往復一致を見ており、
`sn` が保存されなくなれば往復比較が崩れる）。無関係なテストは落ちて
いない。

### (d) `load_data()` が存在しないファイルで返す値を変える

`yt_backgammon_server.py:283` の `return 0, 0` → `return 1, 1`

```
FAILED tests/test_history.py::test_hist_ent2str_contains_sn - IndexError
FAILED tests/test_save_load.py::test_load_data_missing_file_returns_zero
2 failed, 8 passed
```

狙った `test_load_data_missing_file_returns_zero` に加え、
`test_hist_ent2str_contains_sn` も落ちた。原因を確認: `bg_server`
フィクスチャの `ytBackgammonServer.__init__` は
`load_data()` の戻り値が `hist_len < 1` のときだけ
`add_history()` を呼んで初期履歴を積む（`yt_backgammon_server.py:53-56`）。
`(1, 1)` を返すよう壊すと、存在しないファイルにもかかわらず
「読み込めた」ことになって `add_history()` が呼ばれず、
フィクスチャの `_history` が空のまま渡り、`hist_ent2str` のテストが
`_history[-1]` で `IndexError` になる。これは狙ったテスト
（`test_load_data_missing_file_returns_zero`）が直接落ちているのに
加え、フィクスチャ経由の副作用であり、テストの設計上の問題ではないと
判断した（`load_data()` の戻り値を他のテストのフィクスチャが実際に
利用している以上、自然な連鎖）。

いずれのミューテーションでも `src/ytbg/yt_backgammon.py` /
`yt_backgammon_server.py` は作業後に `git checkout --` で元に戻し、
`git status --short` で `src/` の差分がゼロであることを確認済み。

## 4. 利用者のホームを汚していないか

- 実行前 `~/ytbg-*.json` の mtime:
  ```
  /home/ytani/ytbg-1.json 1788964550
  /home/ytani/ytbg-2.json 1788962460
  /home/ytani/ytbg-3.json 1788962667
  /home/ytani/ytbg-4.json 1788962460
  ```
- `uv run pytest` を複数回実行した後も上記 4 ファイルの mtime は
  完全に一致（1 秒も動いていない）。新規ファイルも増えていない
  （`ytbg-*.json` は 4 個のまま）。`conftest.py` の
  `DATAFILE_DIR` を `tmp_path` に差し替える方式は実際に効いている。

## 5. `board.roll` が保存で失われる件（implementer 報告の裏取り）

`ytBackgammonServer` を単体で生成し、実際に `save_data()` した JSON を
確認した。

- 生成直後の `gameinfo['board']` には `roll` キーが存在し、値は
  `False`（`in-memory` 上は持っている）
- `save_data()` で書いた JSON の `history[0]['board']` には `roll`
  キーが**存在しない**

実際に確かめた結果、implementer の報告（`hist_ent2str()` が
`board.roll` を出力しないため、保存 → 読み込みの往復で失われる）は
**事実と一致する**。

## 6. 確かめられなかったこと・判断できないこと

- `tests/` 自体の型検査（`mypy tests` 相当）は指示範囲外として行って
  いない。implementer 同様、`CLAUDE.md` の指示コマンドが `mypy src`
  のみのためこの検証もそれに合わせた。要否は管理者判断
- `board.roll` の欠落を別の TODO 項目にするかどうかは、
  implementer 報告と同じく判断が要る点として残っている（verifier
  からは直さない）
- `TODO.md` のチェックリストのうち「`CLAUDE.md` の『テストの仕組みは
  無い』を直す」は未実施のまま。着手時の分担では implementer の担当
  範囲に見えるが、報告書にも `TODO.md` にも「見送った」旨の記載が
  無いので、単なる作業漏れか、意図的に別項目にする予定かは
  判断できない
