# TODO-009 verifier 報告（2 回目）

ブランチ `starlette`、working tree の変更（未 commit）に対して確認した。
1 回目の確認（`verifier-report.md`）で済んでいるところは繰り返していない。
今回の直し（R1・C1・C2・C3・C4・C5・C7・C8）に絞った。

`./ytbg-stop.sh` は実行していない（依頼どおり）。5001〜5004 は最初から
最後まで触っておらず、確認の前後どちらも 4 つとも 200 だった。自分の確認は
5099 で行った。

## 1. 検証コマンド

| コマンド | 終了コード | 結果 |
|----------|-----------|------|
| `uv run pytest` | 0 | `68 passed`（実装の報告どおり） |
| `uv run ruff check .` | 0 | `All checks passed!` |
| `uv run mypy src` | 0 | `Success: no issues found in 5 source files` |

## 2. 足したテストが本当に効くか（4 パターンを再現、必ず元に戻した）

すべて `\cp` でバックアップしてから壊し、確認後 `\cp` で戻した。戻した
あとは `md5sum` が壊す前と一致することを確認し、`uv run pytest` で
68 passed に戻ることも確認した。

### M1: `broadcast()` の先頭で `return`

**3 件失敗**（実装の報告どおり）。

```
FAILED tests/test_broadcast.py::test_broadcast_reaches_all_clients_even_if_one_fails
FAILED tests/test_broadcast.py::test_broadcast_keeps_order_per_client - Asser...
FAILED tests/test_broadcast.py::test_on_connect_registers_and_sends_gameinfo_to_all
3 failed, 65 passed in 1.09s
```

1 回目の確認で「`broadcast()` を丸ごと monkeypatch していたため 1 件も
落ちない」と報告した壊し方が、今回追加された `bg_server_raw` /
`FakeClient` を使う `tests/test_broadcast.py` で塞がれていることを確認した。

### M5: R1 の直し前に戻す（ロック無し、cancel の前に `_replay_task = None`）

**1 件失敗**（実装の報告どおり）。`test_only_one_replay_runs` が、
追跡外の Task が残ることを検出した。

```
FAILED tests/test_replay.py::test_only_one_replay_runs - AssertionError: asse...
1 failed, 67 passed in 1.08s
```

### M6: C1 の直し前に戻す（n > 0 も `_start_replay()` で Task に）

**6 件失敗。実装の報告（4 件）と一致しなかった。**

```
FAILED tests/test_on_json.py::test_back_moves_history_by_n - AssertionError: ...
FAILED tests/test_on_json.py::test_back_sends_sec_for_checker_move - TypeErro...
FAILED tests/test_on_json.py::test_fwd_moves_history_by_n - AssertionError: a...
FAILED tests/test_on_json.py::test_back_moves_hist_i_by_n - TypeError: 'NoneT...
FAILED tests/test_replay.py::test_running_replay_is_stopped_by_next_request
FAILED tests/test_replay.py::test_two_back_msgs_move_two_steps - AssertionErr...
6 failed, 62 passed in 0.88s
```

壊し方は依頼どおり最小限（`on_json()` の `back` / `fwd`（n を渡す 2 箇所）を
`_run_replay` → `_start_replay` に戻しただけ。差分は 2 行のみ、
`diff` で確認済み）。実装の報告の表は
「4 失敗（`test_two_back_msgs_move_two_steps` ほか 3 件）」だが、
自分の再現では `test_two_back_msgs_move_two_steps` と
`test_running_replay_is_stopped_by_next_request` に加えて、
`tests/test_on_json.py` の既存テスト 4 件（`test_back_moves_history_by_n` /
`test_back_sends_sec_for_checker_move` / `test_fwd_moves_history_by_n` /
`test_back_moves_hist_i_by_n`）も落ちた。いずれも `on_json()` を
`await` した直後に送信済みメッセージを見ようとして `None` を掴む形の失敗で、
`_start_replay()` が Task を作って待たずに返るため（テストが完了を
待っていない）、C1 で意図した直しが効いていることの証拠にはなる。
**件数の食い違いは、実装の報告が数え間違えたか、報告作成時と手元の
コードで差分の当て方が違ったかのどちらかと考えられるが、こちらでは
断定できない。** 壊し方自体は依頼どおりで、落ちるべきものは落ちている
（テストの守備範囲としては問題ない）。

### M7: C2 の直し前に戻す（`_replay()` で包まず、`func()` を直接 `create_task()`）

**1 件失敗**（実装の報告どおり）。

```
FAILED tests/test_replay.py::test_replay_error_goes_to_on_error - ValueError:...
1 failed, 67 passed in 1.07s
```

例外がテストの外（`create_task()` の外）にそのまま飛び出し、
`asyncio` の既定の未処理例外としてテストが失敗する形で検出された。

いずれも壊したあとは元に戻し、`md5sum` の一致と `uv run pytest` の
68 passed 復帰を確認した。

## 3. R1・C1・C2 が直っていることの実測（自分で再現）

サーバを 5099 で起動し、素の WebSocket クライアント
（`uv run --with websockets python <script>`）で確認した。

### R1: 走行中の `back_all` に `back_all` と `fwd_all` を同時にぶつける

履歴を積んだ状態で `back_all` を開始 → 0.3 秒後に、別クライアントから
`back_all` と `fwd_all` を `asyncio.gather()` で同時に送信。

```
R1: got 7 broadcasts, quieted after 1.81s, hit 12s cap=False
R1: last msg type=gameinfo hist_i=41 hist_n=41 at t=0.31s
```

12 秒の上限まで待たされることなく、1.81 秒で broadcast が止まった
（最後に来た `fwd_all` が最後まで走り、`hist_i == hist_n` で終端に
達している）。打ち消し合いは再現しなかった。

### C1: 履歴を積んだ状態で `back`（n=1）を 2 通同時に送る

```
C1: hist_i before double-send = 128 (observed 1 msgs on b, 2 on a)
C1: broadcasts after simultaneous back(n=1) x2 = 2
C1: hist_i after last = 126
```

2 通で `hist_i` が 128 → 126 と 2 手戻り、broadcast も 2 通だった
（移行前と同じ結果）。

### C2: 再生の中で例外を起こす

`backward_hist()` の先頭に `raise ValueError('C2 injected error')` を
一時的に挿入し（`back_all` は `_start_replay()` 経由で Task になる
分岐なので C2 が効く対象）、サーバを再起動して `back_all` を送った。

```
09/10 11:35:19 ❌ ERROR yt_backgammon_server.py:376 on_error()> ?: e='ValueError':ValueError('C2 injected error')
09/10 11:35:19 ❌ ERROR yt_backgammon_server.py:378 on_error()> msg=None
```

`on_error()` が呼ばれ、`ws` が `None`（`client_name(None)` → `'?'`）に
なっていることを確認した。`grep -c 'never retrieved' <ログ>` は **0**。
確認後、注入したコードを削除し、`md5sum` が元と一致することを確認した。

## 4. 実機（WebSocket クライアント 2 本、範囲は 1 回目と同じ）

サーバを再起動しクリーンな状態から確認した。

```
1. gameinfo on connect: gameinfo gameinfo a-second: gameinfo
2. put_checker reaches both: True True
3. back_all replay + interleaved dice, types seen: ['gameinfo', 'gameinfo', 'dice', 'gameinfo', ...]
   dice message present during replay: True
4. still connected after invalid JSON, next recv type: gameinfo
   a.state open: OPEN
```

- 接続時に両方へ `gameinfo` が届く（`b` が接続すると `a` にも 2 通目の
  `gameinfo` が来るのは、`on_connect()` が全員へ送るための仕様どおり。
  1 回目の確認と同じ）
- `put_checker` は両方に届く
- `back_all` の連続再生の最中に、別クライアントから送った `dice` が
  割り込んで処理される（再生を止めていない）
- 不正な JSON（`"this is not json {{{"`）を送っても接続は切れず、
  その後の `dice` も往復できる

サーバのログ（`/tmp/ytbg-5099-final3.log`）に `Traceback` / `never retrieved`
は **0 件**。スクリプト終了時（`async with` が両方の接続を閉じる際）に
`WebSocketDisconnect` / `RuntimeError('WebSocket is not connected...')` の
ERROR ログが数行出たが、これはテストスクリプトが接続を閉じる過程での
競合であり、実装側の問題ではないと判断した（`on_error()` で受け止めて
おり、接続を閉じる `finally` の `on_disconnect()` も正常に走っている）。

## 5. ブラウザ（今回の直しに関わる範囲のみ）

`uv run --with playwright python <script>`、`headless=True` で実行した
（1 回目は `headless=False` だったが、今回は表示の要る確認（再接続の目視
待機など）が無いため headless にした）。

- 2 タブ（`/p1` / `/p2`）を開き、チェッカーを 7 個ドラッグして履歴を積んだ
- `p1` で「連続で戻す(高速)」（`back_all`）を実行
- 走行中に `p2` で「連続で進める(高速)」（`fwd_all`）を実行
- 両タブとも最終的に `hist_i=10, hist_n=10`（終端）で一致し、盤面も
  同一になった（スクリーンショットで確認）
- チェッカーのドラッグは両タブに反映された（`todo009v2-02-drag-*.png`）
- コンソールログ（`todo009v2-console-log.txt`、1375 行）に `error` を含む
  行は 0 件、`favicon` の 404 も 0 件（今回のシナリオでは要求されなかった
  模様）

スクリーンショット（`~/tmp/playwright-mcp/`）:
`todo009v2-01-initial-p1.png` / `-p2.png`、
`todo009v2-02-drag-p1.png` / `-p2.png`、
`todo009v2-03-backall-mid-p1.png` / `-p2.png`、
`todo009v2-04-after-fwdall-p1.png` / `-p2.png`。
コンソールログ全文: `~/tmp/playwright-mcp/todo009v2-console-log.txt`

## 6. 差分の範囲

`git status` / `git diff --stat`:

```
 CLAUDE.md                             |  99 ++++---
 README.md                             |  15 +-
 TODO.md                               |  26 +-
 pyproject.toml                        |  11 +-
 src/ytbg/__init__.py                  |   7 +
 src/ytbg/__main__.py                  | 131 ++++-----
 src/ytbg/webroot/static/ytbg.js       | 259 ++++++++++--------
 src/ytbg/webroot/templates/index.html |   4 -
 src/ytbg/yt_backgammon_server.py      | 295 ++++++++++++++------
 tests/conftest.py                     | 142 ++++++----
 tests/test_history.py                 |  14 +-
 tests/test_on_json.py                 | 140 +++++-----
 uv.lock                               | 491 ++++++++++++++++++----------------
 13 files changed, 955 insertions(+), 679 deletions(-)
 + tests/test_broadcast.py, tests/test_replay.py（新規）
```

`CLAUDE.md` / `README.md` / `TODO.md` は main が並行して書いているもの
（依頼どおり、報告しなくてよい範囲）。それ以外は依頼の範囲
（`pyproject.toml` / `src/ytbg/__init__.py` / `src/ytbg/__main__.py` /
`src/ytbg/yt_backgammon_server.py` / `webroot/` / `tests/`）に収まっている。
依頼の範囲外のファイル変更は無い。

`src/ytbg/yt_backgammon.py` は `git diff --stat` で空（変更なし）を確認した。

## 確かめられなかったこと・気づいたこと

- **M6 の失敗件数が実装の報告（4 件）と自分の再現（6 件）で食い違った。**
  壊し方は依頼どおり最小限（`on_json()` の 2 箇所を戻しただけ、差分は
  2 行）で行った。落ちること自体は確認できており、テストの守備範囲としては
  問題ないと考えるが、**実装の報告の数え方に何か違いがある可能性がある**
  （数え間違い、確認したコードの版の違いなど）。原因の断定はできない。
  上位モデルの判断、または implementer への確認が要るかもしれない
- ブラウザ確認は `headless=True` で行った（1 回目は `headless=False`）。
  今回のシナリオでは目視の必要が無かったための判断
- 5 のブラウザ確認で favicon の 404 が出なかったのは、1 回目と操作の
  シナリオが違う（`New Game` を呼んでいない、タブを閉じていない等）
  ためと考えられる。異常ではないと判断した
