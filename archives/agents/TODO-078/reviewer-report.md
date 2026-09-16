# TODO-078 レビュー報告

対象: `git diff`（`src/ytbg/lobby.py`、`src/ytbg/paths.py`、`tests/test_lobby.py`、
`docs/Admin.md`、`docs/Developer.md`）。コードは直していない。

## 検討

### 1. `BoardProcess.start()` で、`create_subprocess_exec` が例外を投げると `out` を閉じる経路が無い

`src/ytbg/lobby.py:245-250`

```python
out = self._open_log()
proc = await asyncio.create_subprocess_exec(
    *cmd, stdout=out,
    stderr=asyncio.subprocess.STDOUT if out else None)
self._proc = proc
self._watch = asyncio.create_task(self._wait(proc, out))
```

`out` を閉じているのは `_wait()` の `finally`（`lobby.py:268-271`）だけで、これは
`_watch` タスクが作られてから初めて効く。`_open_log()` の後、
`create_subprocess_exec` が例外（`OSError` など。fork 失敗や fd 上限など）で
落ちると、`out` を閉じるコードをどこも通らない。

**実測**: `asyncio.create_subprocess_exec` を差し替えて `OSError` を投げさせ、
`start()` を直接 `await` して例外を伝播させた場合は、CPython の参照カウントで
`out` はすぐに閉じられ、fd は残らなかった（例外を保持する変数を残さず、
そのまま伝播させたケース）。

**未確認**: 実際の呼び出し元は 2 つ
（`lobby.py:330` の `lifespan` から順に `await p.start()`、
`lobby.py:346` の `action()` エンドポイントの `await getattr(p, name)()`）で、
どちらも例外を直接伝播させるだけなので同じ経路のはず。ただし Starlette の
例外処理（`ServerErrorMiddleware` 相当）が例外やその traceback をどれくらいの
間保持するかは確認していない。保持する時間が延びれば、その間 `out` は
開いたままになる。管理者が「起動」を繰り返し押すような壊れた環境
（fd 上限など）では、失敗のたびに `out` が積み重なる余地がある。

`_wait()` と同じ形で `try: ... except: out.close() if out else None; raise` を
`create_subprocess_exec` の呼び出しに掛けておけば、CPython の参照カウントに
頼らず確実に閉じられる。直すかどうかは判断材料として記載するのみ。

### 2. `tests/test_lobby.py` の `test_start_passes_paths` は `out` を 2 箇所から閉じる形になっている

`tests/test_lobby.py:216-224`

`p._watch.cancel()` で `_wait()` タスクをキャンセルした後、テスト自身も
`out.close()` を呼んでいる。`_wait()` の `finally` でのクローズと、テストの
クローズが両方効く可能性があるが、`io.IOBase.close()` は 2 回目以降は
無視される（Python のドキュメントに明記された仕様）ので実害は無い。
新しく壊れる訳ではないが、`out` を直接扱う分だけ、テストと実装の後始末が
かぶっている点は気に留めてよい。

## 好みの範囲

### 3. `_wait()` の `out` にデフォルト値 `None` がある

`src/ytbg/lobby.py:265-266`

呼び出し箇所は `lobby.py:250` の 1 か所だけで、必ず `out` を渡している。
デフォルト値が要る理由が無く、将来呼び出しを増やしたときに `out` を渡し忘れても
黙って動いてしまう（クローズされないだけで気付きにくい）。

## 確認して問題無かった点

- **`stdout` / `stderr` の分岐**（`lobby.py:246-248`）: `paths` が無いときは
  `_open_log()` が `None` を返し、`stdout=None, stderr=None` になって
  子は lobby の標準出力・標準エラーをそのまま使う。`test_start_passes_prefix`
  （`tests/test_lobby.py:157-183`）がこの分岐を
  `kws[0] == {'stdout': None, 'stderr': None}` で確かめている。`paths` が
  あるときは `test_start_passes_paths`（同 186-224）が `stdout` がファイル
  オブジェクトで名前が `log/board-<server_id>.log` であること、
  `stderr == asyncio.subprocess.STDOUT` であることを確かめている。両方の
  分岐にテストがあり、意図を捕まえている
- **`stop()` → `start()` を繰り返したときの fd**: `_wait()` の `finally` は
  タスクごとに 1 回だけ実行される。`stop()` は同じ `watch` を
  `asyncio.wait_for(asyncio.shield(watch), ...)` と、タイムアウト時の
  `await watch` の 2 か所で待つが、同じタスクを 2 回 `await` しても
  タスク本体は 1 回しか走らない（2 回目は結果を再取得するだけ）ので
  二重クローズにはならない。正常終了・`stop()` のどちらの経路でも、
  次の `start()` が呼ばれる前に前のファイルは閉じている
  （`test_board_log_file`、`tests/test_lobby.py:469-486`、が
  停止→起動を実際に行い、ログが追記されることを確かめている）
- **`_open_log()` のディレクトリ作成**: `path.parent.mkdir(parents=True, exist_ok=True)`
  は `src/ytbg/storage.py:88` と同じ書き方で、既存の「書くときに作る」設計
  （`docs/Developer.md`、`src/ytbg/paths.py` の docstring）に合っている
- **ログの書き方の慣習**: 新しく追加したログ出力（`self.__log.info`/`warning`）は
  すべて既存のものの流用で、`{}` と引数で渡す形を保っている。f-string は
  使っていない
- **範囲**: `git diff --stat` は指定された 5 ファイルのみで、それ以外の
  変更は混ざっていない
- **過剰実装**: ローテーションや設定項目は追加されておらず、目的
  （「ローテーションはしない」）どおりの最小実装
- **lint/型チェック**: `uv run ruff check`・`uv run mypy src`・
  `uv run basedpyright` はいずれも 0 件（実測）
- **ドキュメントの整合**: `docs/Admin.md`・`docs/Developer.md` の記述は
  実装（`_open_log()`、`paths` が無ければ lobby の標準エラーを使う分岐）と
  一致している

## 判断が要る点

- 1 の「例外時に `out` を閉じる経路が無い」は、CPython の参照カウントで
  今のところ実害が出ていないが、確実さを優先するなら直したほうがよい
  （Starlette の例外処理が traceback をどれくらい保持するかは未確認）
