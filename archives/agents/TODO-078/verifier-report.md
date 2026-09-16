# TODO-078 検証報告（verifier）

## 1. 検証一式（それぞれ 1 回）

- `uv run pytest -q` → 391 passed, 1 warning（警告は starlette の既知の
  DeprecationWarning で無関係）。終了コード 0
- `uv run ruff check .` → `All checks passed!`。終了コード 0
- `uv run mypy src` → `Success: no issues found in 14 source files`。
  終了コード 0
- `uv run basedpyright` → `0 errors, 0 warnings, 0 notes`。終了コード 0

いずれも落ちなかった。

## 2. 壊して落ちることの確認

3 通りとも、直後に `git diff` で元の内容に戻ったことを確認してから次へ進んだ
（`git checkout -- src/` は使わず、該当行だけを sed/python で戻した。
理由は下の「気づいたこと」）。

### a. `BoardProcess._open_log()` を常に `None` を返すようにする

`if self.paths is None: return None` の直後に `return None` を追加。

`uv run pytest -q tests/test_lobby.py -k "test_start_passes_paths or test_board_log_file"`
→ **2 件とも失敗**。

- `test_start_passes_paths`: `AttributeError: 'NoneType' object has no attribute 'name'`
  （`out = kws[0]['stdout']` が `None` になり `out.name` で落ちる）
- `test_board_log_file`: `AssertionError: timeout`
  （`log/board-b0.log` が作られず `read_text()` が失敗し続ける）

### b. ログファイルを `'ab'` ではなく `'wb'` で開く

`return path.open('ab')` → `return path.open('wb')`。

`uv run pytest -q tests/test_lobby.py -k "test_board_log_file"` → **失敗**。

- `AssertionError: timeout`（再起動後の 2 回目の出力が 1 回目を消してしまい、
  `s.startswith(first) and len(s) > len(first)` を満たさない）

（`test_start_passes_paths` はファイルの open モード自体は見ていないので対象外）

### c. `stderr=asyncio.subprocess.STDOUT` を渡さないようにする

`stderr=asyncio.subprocess.STDOUT if out else None` → `stderr=None`。

`uv run pytest -q tests/test_lobby.py -k "test_start_passes_paths or test_board_log_file"`
→ **2 件とも失敗**。

- `test_start_passes_paths`: `AssertionError`（`kws[0]['stderr'] ==
  asyncio.subprocess.STDOUT` を期待しているが `None` になっている）
- `test_board_log_file`: `AssertionError: timeout`
  （stderr がログファイルへ回らないため、標準エラー側の出力がファイルに
  出ない。ただしこのボードは起動時に標準エラーへ何も出さない構成なので、
  厳密には「壊れた原因」ではなく「意図と違う配線になった」ことをこのテストが
  たまたま検出したとも言える。狙った変更点は捕まえている）

3 通りとも狙ったテストが落ち、他の壊し方は試していない（指示の 3 通りで
十分と判断した）。

## 3. 手で `ytbg board` を起動したときログファイルが作られないこと

`YTBG_DIR=/tmp/.../ytbg_manual_dir uv run ytbg board -p <空きポート> -i images1a 1`
を実プロセスで起動し 3 秒待って確認。

作られたファイルは `data/ytbg-1.jsonl` と手元の出力リダイレクト先だけで、
**`log/` ディレクトリそのものが作られなかった**。期待どおり。
確認後 `kill` で止め、`ps aux | grep ytbg` で残プロセスが無いことを確認した。

## 4. `uv run ytbg lobby` を実プロセスで起動し、ログファイルにボードの出力が出ること

`YTBG_DIR=<tmp>` で `ytbg.toml`（board 1 面）を作り、空きポートで
`uv run ytbg lobby -c <tmp>/ytbg.toml -p <空きポート>` を起動。4 秒待って確認。

- `log/board-1.log` が作られ、中身はボード起動時のログ
  （`__main__.py:140 board()> server_id=1, port=...`、
  `storage.py:106 load()> ...: no data file` など）
- 一方 `lobby.out`（lobby 自身の標準エラーのリダイレクト先）には、lobby 自身の
  起動ログと `start: [...]` だけで、ボードのログは出ていない
  （lobby と手で起動したボードは標準エラーのまま、という指示どおりの分離）
- `curl` でボード（52431）・lobby（49173）どちらも 200 を確認
- lobby を `kill` したところ、`log/board-1.log` への追記は無いまま、
  `lobby.out` に `stop: server_id=1, pid=...` と
  `exited (pid=..., returncode=-15)` が出て、子のボードも一緒に終了した
  （`ps aux` で残プロセス無し）

**気づいたこと（判断不要・報告のみ）**: `log/board-1.log` に「uvicorn の
起動ログ」らしき行（`Uvicorn running on ...` のような文言）は出なかった。
ただし `lobby.out`（lobby 自身、既存の標準エラー経路）にも同種の行は出ておらず、
このアプリでは uvicorn の起動メッセージ自体が元々出ない構成のようだった
（`mylog` 経由の独自ログだけが出る）。TODO-078 の変更で欠けたのではなく、
元からの挙動と見える。実際にファイルへ出ているのはボード起動時の
独自ログ（`__main__.py` / `storage.py` / `server.py` の INFO・WARNING）で、
これが「lobby が起動したボードの標準出力・標準エラー」に相当すると判断した。

## 変更ファイルと指示の範囲

`git status --short` は次の 5 件で、指示の対象範囲と一致:

```
M docs/Admin.md
M docs/Developer.md
M src/ytbg/lobby.py
M src/ytbg/paths.py
M tests/test_lobby.py
```

## 作業中のミスと復旧

壊し方 a を確認した後、誤って `git checkout -- src/` を実行し、
`src/ytbg/lobby.py` と `src/ytbg/paths.py` の TODO-078 の実装（未コミットの
差分）を丸ごと消してしまった。直前に取得していた `git diff` の内容から
`git apply` でパッチを再適用して復元し、`uv run pytest -q` で 391 件全部
通ることを確認して復旧を確かめた。以降の壊し方 b・c は、対象行だけを
`sed` / 文字列置換で戻す方法に切り替えた。**最終的な `src/` の内容は復元前と
一致していることを確認済み**（復元直後と壊し方 b・c を戻した後、それぞれ
全体テストを流して 391 passed を確認している）。

## 判断できないこと・確かめられなかったこと

- ログのローテーションをしない点や `~/.ytbg/log/` への実際の利用者運用
  （logrotate 連携など）は、ドキュメントの記述どおりで動くことは確認したが、
  実運用での長時間稼働は検証範囲外
- 上記「uvicorn の起動ログ」が出ない点が、指示の想定（「うｖicorn の起動ログが
  出ることを目で確かめる」）とずれているように見える。これは既存の挙動と
  判断したが、実装のログ設定を追った上での確定的な判断ではないので、
  必要なら管理者側で `mylog.py` / uvicorn の設定を確認してほしい

---

## 追加分の再確認（レビュー指摘への修正 3 点）

対象は `git diff` に出た 3 点のみで、指示どおりの範囲と一致していた:

1. `src/ytbg/lobby.py` の `start()` に、`create_subprocess_exec` が例外を
   投げたときにログファイルを閉じる `try / except BaseException: ... raise`
   を追加
2. `_wait()` の第 2 引数 `out` の既定値 `None` を外した（呼び出しは
   `self._wait(proc, out)` の 1 か所のみで、影響は無い）
3. `tests/test_lobby.py` の `out.close()` にコメントを追加（挙動は変わらない）

### 検証一式（それぞれ 1 回）

- `uv run pytest -q` → 391 passed, 1 warning（既知の DeprecationWarning のみ）
- `uv run ruff check .` → `All checks passed!`
- `uv run mypy src` → `Success: no issues found in 14 source files`
- `uv run basedpyright` → `0 errors, 0 warnings, 0 notes`

いずれも終了コード 0 で落ちなかった。

### 1 の経路を壊して落ちるかの確認

手順:

1. `src/ytbg/lobby.py` の `try / except BaseException: ... raise` の節を、
   手で（`sed`/文字列置換）元の「例外処理無し」の形に戻した
2. `tests/test_lobby.py` の末尾に一時テスト
   `test_TMP_open_log_closed_on_exec_error` を追加。
   `create_subprocess_exec` を `OSError` を投げるものに差し替え、
   `p.start()` が例外を伝播させたあとに `out.closed` を見る
3. `uv run pytest -q tests/test_lobby.py -k test_TMP_open_log_closed_on_exec_error`
   → **失敗**（`except` を消した状態）:

   ```
   AssertionError: create_subprocess_exec が例外を投げてもファイルが開いたままになっている
   assert False
    +  where False = <_io.BufferedWriter name='.../log/board-1.log'>.closed
   ```

4. `src/ytbg/lobby.py` の `except BaseException` の節を手で元へ戻した
5. 同じ一時テストを再実行 → **1 passed**（修正が効いていることを確認）
6. 一時テストを削除。`git diff` で `tests/test_lobby.py` が指示の 3 点のみに
   戻っていることを確認
7. `uv run pytest -q` / `ruff check .` / `mypy src` / `basedpyright` を
   再実行し、全部通ることを確認（上の「検証一式」の結果）
8. `git status --short` は `docs/Admin.md`、`docs/Developer.md`、
   `src/ytbg/lobby.py`、`src/ytbg/paths.py`、`tests/test_lobby.py` の 5 件と
   `archives/agents/TODO-078/`（このディレクトリ）のみで、コードの内容は
   コーディネーターが示した 3 点の diff と一致することを確認済み
   （`git checkout` は使わず、すべて手で戻した）

### 恒久的にテストを足すべきかの意見

**足すことを勧める。** 判断できない点は無い。理由:

- `except BaseException` を消すと、上の一時テストのとおり実際に落とせる
  （狙った変更点を検出できる、意味のあるテストになる）
- 起動できない設定（存在しないコマンド、権限エラーなど）は珍しくなく、
  ログファイルの記述子がリークし続けるとファイルディスクリプタを
  食い尽くす方向の不具合になりうる。lobby は長時間動かすプロセスなので、
  この経路が壊れても気づきにくい
- 既存の `test_board_cannot_start`（`tests/test_lobby.py`）は「起動できない
  ボード」を見ているが、これは `create_subprocess_exec` 自体は成功して
  子プロセスが即座に終了するケースで、`_wait()` 側の `finally` で閉じられる
  経路。今回の `except BaseException` が守る「`create_subprocess_exec` 自体が
  例外を投げる」経路は別物で、既存のテストでは捕まえられない

追加するなら、上で使った一時テストとほぼ同じ形（`create_subprocess_exec` を
例外を投げるものに差し替え、`_open_log()` が返したファイルが `start()` の
例外伝播後に閉じているかを見る）でよいと考える。テスト名は一時的に付けた
`test_TMP_...` ではなく、他のテストの命名（`test_board_...` や
`test_start_...`）に合わせるのがよい。
