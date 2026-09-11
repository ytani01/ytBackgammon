# TODO-025 verifier 報告

サーバの分割（hub / history / replay / app / server）の確認。

## 1. 検証コマンド（すべて終了コード 0）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 155 passed |
| `uv run ruff check .` | All checks passed! |
| `uv run mypy src` | Success: no issues found in 11 source files |
| `node --test tests/browser/`（timeout 600000） | 5 pass / 0 fail |

## 2. わざと壊して確かめた 4 通り（すべて `src/` を 1 箇所だけ書き換え →
`uv run pytest` → 元に戻す。戻したあと `diff` で元と同一なことを確認済み）

| # | 壊した場所 | 結果 |
|---|---|---|
| 1 | `app.py` の `on_json()` を囲む `except Exception`（line 101 側）を消す | `tests/test_ws.py::test_error_in_on_json_keeps_connection` が `KeyError: 'ch'` で **1 件だけ**失敗。報告どおり |
| 2 | `replay.py` の `start()` で `_cancel()` をロックの外に出す | `tests/test_replay.py::test_only_one_replay_runs` が「追跡できない Task が残っている」で **1 件だけ**失敗。報告どおり（TODO-009 の性質を見るテストとして機能している） |
| 3 | `server.py` の `new_game()` から `self._svr_ver` を消す（`self._gameinfo.new_game(self._svr_ver)` → `self._gameinfo.new_game()`） | `test_clock.py` 2 件・`test_on_json.py` 2 件、計 **4 件**が `TypeError: GameInfo.new_game() missing 1 required positional argument` で失敗。報告どおり |
| 4 | `app.py` の `Route('/p1', index)` を落とす | `tests/test_ws.py::test_index_routes` が `AssertionError: /p1` / `404 == 200` で **1 件だけ**失敗。報告どおり |

いずれもハングせず、報告と一致する落ち方をした。落ちなければ「そのテストは
狙ったところを見ていない」と判断するところだったが、4 つとも狙いどおり。

## 3. 実プロセスでの動作確認

`tests/browser/helper.mjs` の `start_server()` / `launch_browser()` /
`open_board()` を使い、一時スクリプトで確認（確認後に削除、`git status` は
クリーンに戻した）。

- `/`, `/p1`, `/p2` → いずれも 200、本文はすべて同一（10165 バイト）
- `/static/images1a/board-base.png` → 200
- 2 枚のタブを開き、片方で Roll → もう片方に同じ dice 値が同期することを
  実測（`[0,0,5,0]` が両方に反映）
- `data_dir`（`YTBG_DATA_DIR` に指定した一時ディレクトリ）には
  `ytbg-browsertest.jsonl` が作られ、`$HOME` に `ytbg-*.jsonl` は
  1 件も増えていないことを確認

## 4. 分割前（`b47895e`）の `.jsonl` を、いまのコードで読めること

`git worktree` で `b47895e` を別ディレクトリに出し、`uv sync` の上で
実プロセスを起動、Roll と free move のドラッグを 3 回行って
`ytbg-oldfmt.jsonl`（5 エントリ、`v: 2` 形式）を作った。worktree のサーバを
止め、**同じ jsonl ファイル**を今の作業ツリーのコードで
`YTBG_DATA_DIR` として指定して起動したところ、

```
storage.py:151 _load_jsonl()> history=(5), fwd_hist=(0)
history.py:127 load()> _history=(5), _fwd_hist=(0)
```

とログに出て、5 件とも読み込めた。ブラウザで開いて盤面のチェッカー座標を
取ると、保存ファイルの `sn=5` エントリのチェッカー配置と一致することも
確認した（例: player0 の point が `6,6,5,5,5,8,8,8,13,13,13,13,13,24,24`）。
`git worktree remove --force` で後始末済み。

## 5. `git status` / `git diff --stat`

現在の作業ツリー（未コミット分）:

```
 M CLAUDE.md
 M pyproject.toml
 M src/ytbg/__init__.py
 M src/ytbg/__main__.py
 M src/ytbg/gameinfo.py
 M tests/conftest.py
 M tests/test_broadcast.py
 M tests/test_clock.py
 M tests/test_datafile_dir.py
 M tests/test_gameinfo_ops.py
 M tests/test_history.py
 M tests/test_on_json.py
 M tests/test_replay.py
 M tests/test_save_load.py
 M uv.lock
?? archives/agents/TODO-025/
?? src/ytbg/app.py
?? src/ytbg/history.py
?? src/ytbg/hub.py
?? src/ytbg/replay.py
?? src/ytbg/server.py
?? tests/test_ws.py
```

TODO-025 の範囲（`hub.py` / `history.py` / `replay.py` / `app.py` /
`server.py` の切り出し、`GameInfo` へのメソッド吸収、`tests/test_ws.py`、
`CLAUDE.md` の該当節の更新、`httpx2` の依存追加）に収まっている。
`grep -rn "壊した版" src tests` は 0 件（壊した内容そのものは残っていない
ことを 2 の確認の際に diff で個別に確かめ済み）。
**`TODO.md` は変更されていない**（今の作業ツリーの diff に含まれない）。

### 気づいたこと（実装の範囲外だが、コミット済み履歴の問題）

`git log` を見ると、直近のコミット `6aaba75`
（`docs(todo): history フラグの付け方を見直す件を TODO-032 として立てる`）が、
メッセージ上は TODO.md への docs コミットだが、**実際には
`src/ytbg/yt_backgammon.py`（140 行）と
`src/ytbg/yt_backgammon_server.py`（579 行）の削除、
`tests/test_yt_backgammon.py` → `tests/test_gameinfo_ops.py` のリネームを
含んでいる**（`git show 6aaba75 --stat`）。これは implementer 報告にある
「どちらも `git mv` ではなく、中身を移してから `git rm` した」という
TODO-025 の作業そのものに見える。TODO-032 の docs コミットに
TODO-025 の削除作業が混入した状態で、すでに履歴に入っている。
**このコミット自体は今回の作業ツリーの差分ではないので直せないが、
コミットを分け直すかどうかは main の判断が要る。**
（reviewer 報告の末尾にも「TODO.md の差分だけは TODO-025 と無関係」という
近い指摘があるが、実際にはコミットのスコープの混入であり、TODO.md の
差分だけの話ではない）

## 確かめられなかったこと・判断できないこと

- 上記「気づいたこと」のコミット分割をやり直すべきかどうかは判断できない。
  過去のコミットの扱いは main の判断が必要
- `httpx` ではなく `httpx2` にした判断（implementer 報告の「判断が要る点」）
  の是非は、確認担当の範囲では判断できない
