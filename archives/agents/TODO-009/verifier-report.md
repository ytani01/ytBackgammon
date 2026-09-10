# TODO-009 verifier 報告

ブランチ `starlette`。working tree の変更（未 commit）に対して確認した。
確認中は `./ytbg-stop.sh` で 5001〜5004 を止めてから、5099 で自前のサーバを
使った。**確認後、`./ytbg-boot.sh` を実行し 5001〜5004（すべて 200）に
戻してある。**

## 1. 検証コマンド

| コマンド | 終了コード | 結果 |
|----------|-----------|------|
| `uv sync` | 0 | `Resolved 31 packages` / `Checked 29 packages` |
| `uv run pytest` | 0 | `57 passed in 0.21s`（報告どおり） |
| `uv run ruff check .` | 0 | `All checks passed!`（報告どおり） |
| `uv run mypy src` | 0 | `Success: no issues found in 5 source files`（報告どおり） |

実装の報告（57 passed / ruff 0 件 / mypy 0 件）と一致。

## 2. テストが本当に効いているか（壊して確認、必ず元に戻した）

いずれも `\cp` でバックアップしてから壊し、確認後 `\cp` で戻した。
戻したあとは 3 パターンとも `git diff --stat` が壊す前と同じ
（`src/ytbg/yt_backgammon_server.py | 260 ++++++++++++++++++++++++++-------------`、
`173 insertions(+), 87 deletions(-)`）であることを確認し、最後にもう一度
`uv run pytest` で 57 passed に戻ることも確認した。

### (a) `broadcast()` を何もしないメソッドにする

`for ws in list(self._clients): ...` の直前に `return` を挿入。

**結果: 57 passed のまま、1 件も落ちない。** 想定と異なる。原因は
`tests/conftest.py` の `bg_server` フィクスチャが
`monkeypatch.setattr(ytBackgammonServer, 'broadcast', fake_broadcast)` で
**`broadcast()` そのものを丸ごと差し替えている**ため。テストは
`broadcast()` の中身（`_clients` を回して `send_json` する処理）を一切
実行しておらず、`emit_gameinfo()` や `on_json()` が「`broadcast()` という
名前のメソッドを呼んでいること」しか確認していない。
**この壊し方は、依頼どおりにやっても pytest では検出できない。**
`broadcast()` の中身が正しく動くかは、5 の素の WebSocket クライアントに
よる実測と、6 のブラウザでの複数タブ同期でしか確かめられていない。
（実際、5・6 のどちらも 2 クライアント間の同期を確認できているので、
実装自体が壊れているとは考えていない。テストの守備範囲の話として報告する）

### (b) `on_json()` 末尾の `await self.broadcast(msg)` を消す（コメントアウト）

```
        # broadcast
        # await self.broadcast(msg)
```

**結果: 10 件失敗。**

```
FAILED tests/test_on_json.py::test_put_checker_broadcasts_msg - AssertionErro...
FAILED tests/test_on_json.py::test_fallthrough_types_broadcast_the_received_msg[put_checker-data0]
FAILED tests/test_on_json.py::test_fallthrough_types_broadcast_the_received_msg[cube-data1]
FAILED tests/test_on_json.py::test_fallthrough_types_broadcast_the_received_msg[dice-data2]
FAILED tests/test_on_json.py::test_fallthrough_types_broadcast_the_received_msg[set_turn-data3]
FAILED tests/test_on_json.py::test_fallthrough_types_broadcast_the_received_msg[set_playername-data4]
FAILED tests/test_on_json.py::test_fallthrough_types_broadcast_the_received_msg[set_score-data5]
FAILED tests/test_on_json.py::test_fallthrough_types_broadcast_the_received_msg[resign-data6]
FAILED tests/test_on_json.py::test_fallthrough_types_broadcast_the_received_msg[set_clock_limit-data7]
FAILED tests/test_on_json.py::test_fallthrough_types_broadcast_the_received_msg[set_player_clock-data8]
======================== 10 failed, 47 passed in 0.35s =========================
```

代表的な失敗（`assert emitted.last == expected` が `None == {...}`）:

```
>       assert emitted.last == expected
E       AssertionError: assert None == {'type': 'set_player_clock', 'data': {'player': 1, 'clock': [60, 3]}, 'history': False}
```

元に戻したことを確認し、`uv run pytest` で 57 passed に戻ることも確認した。

### (c) `backward_hist()` の `_fwd_hist.append(...)` を消す

```python
while len(self._history) > 1:
    self._history.pop()   # _fwd_hist.append(...) を消した
```

**結果: 9 件失敗。**

```
FAILED tests/test_history.py::test_backward_and_forward_hist - assert 0 == 1
FAILED tests/test_on_json.py::test_returning_types_do_not_broadcast_original_msg[fwd]
FAILED tests/test_on_json.py::test_returning_types_do_not_broadcast_original_msg[fwd2]
FAILED tests/test_on_json.py::test_returning_types_do_not_broadcast_original_msg[fwd_all]
FAILED tests/test_on_json.py::test_back_moves_history_by_n - assert 0 == (0 + 2)
FAILED tests/test_on_json.py::test_fwd_moves_history_by_n - AssertionError: a...
FAILED tests/test_on_json.py::test_fwd_all_moves_history_to_the_end - Asserti...
FAILED tests/test_on_json.py::test_fwd2_behaves_like_fwd_all - AssertionError...
FAILED tests/test_on_json.py::test_back_moves_hist_i_by_n - assert 2 == 3
========================= 9 failed, 48 passed in 0.32s =========================
```

元に戻したことを確認し、`uv run pytest` で 57 passed に戻ることも確認した。

**まとめ**: (b) (c) は狙ったとおり落ちた。(a) は落ちなかった。テストの
設計（`broadcast()` を丸ごと monkeypatch する）上、`broadcast()` 内部の
実装（送信ループや例外処理）はユニットテストの対象外になっている。
これは今回の移行で作られたものというより、TODO-009 以前の `emit()` の
モックの仕方を踏襲した設計であり、実装の報告の「判断が要る点」にも
挙がっていない。**判断は要るが、pytest の外（5・6 の実機確認）で
補っているので、必ずしも直す必要があるとは限らない**（管理者の判断）。

## 3. サーバの起動と HTTP

`./ytbg.sh -d -p 5099 -i images1a 99` で起動し、すべて 200:

```
/ -> 200
/p1 -> 200
/p2 -> 200
/static/ytbg.js -> 200
/static/images1a/board-base.png -> 200
```

`curl` で取得した `/` の HTML に `socket.io` の文字列は無し（grep 0 件）。

## 4. `-d` の効き方

- `-d` なし: stderr は loguru の 1 行（起動時の INFO）のみ。`INFO:`（uvicorn）
  の行は 0 件、`Uvicorn running on ...` も出ない
- `-d` あり: loguru の DEBUG に加え、`Uvicorn running on ...`、
  `"GET / HTTP/1.1" 200 OK` などのアクセスログが出る

実装の報告の「追加の直し 2」（`log_level` を `-d` で切り替える）どおりの
挙動。

## 5. WebSocket の実測（素のクライアント）

`uv run --with websockets python <script>` で 2 本接続して確認
（スクリプトはスクラッチパッドの `wstest.py` / `wstest2.py`）。

- 接続すると両方に `gameinfo` が届く
- A の `put_checker` が A・B 両方に同じ内容で届く
- `history: true` の `put_checker` を 8 回送って履歴を積んだあと `back_all`
  を送ると、B は `['gameinfo', 'gameinfo', 'dice', 'gameinfo', ...]` の順で
  受信した（`dice` は B 自身が再生の途中で送ったもの）。**再生中に届いた
  B のメッセージが処理され、再生を止めていない**ことを確認
- 別に履歴を積んで `back_all` の直後（0.1 秒後）に `fwd_all` を送ると、
  サーバのログに `_cancel_replay()> replay canceled` が出て、A が受け取る
  `hist_i` は最終的に最大値（9）で終わった。**前の再生が途中で止まり、
  新しい再生（前進）に切り替わった**ことをログとメッセージの両方で確認
- 不正な JSON（`"this is not json {{{"`）を送っても接続は開いたまま
  （`a.state == 1`）。その後の `dice` メッセージも普通に往復した
- `data` が足りないメッセージ（`{"type":"back","data":{},"history":false}`）
  を送っても接続は開いたまま。その後の `dice` も往復した
- サーバのログ（`/tmp/ytbg-5099-ws.log`）を最後まで見たが、上の 2 件で
  出た `ERROR` 2 行（`JSONDecodeError` / `KeyError('n')`）以外に
  `traceback` の文字列は 0 件

## 6. ブラウザでの操作確認

playwright（`headless=False`、`DISPLAY=localhost:10.0` で表示あり）で
`uv run --with playwright python <script>` を実行。

### 基本操作（2 タブ、`/p1` / `/p2`）

- 盤面（チェッカー・ダイス・キューブ・時計）が描画される
- Roll でダイスを振る（p1・p2 とも）
- チェッカーをドラッグして動かし、もう一方のタブに反映される
- 1 手戻す・1 手進める（`backward_hist()` / `forward_hist()`）
- `back_all()` の連続再生（途中と最後の 2 枚を撮影）
- New Game（`new_game()`）
- p2 のタブを閉じても p1 は動き続ける（閉じたあとにダイスを振れた）
- コンソールのエラーは `favicon.ico` の 404（3 件、TODO-009 と無関係の
  既存の挙動）のみ。それ以外の JS エラーは無し

スクリーンショット（`~/tmp/playwright-mcp/`）:
`todo009-01-initial-p1.png` / `-p2.png`、
`todo009-02-after-roll-p1.png` / `-p2.png`、
`todo009-03-drag-p1.png` / `-p2.png`、
`todo009-04-back1-p1.png` / `-p2.png`、
`todo009-05-fwd1-p1.png`、
`todo009-06-backall-mid-p1.png` / `-p2.png`、
`todo009-06-backall-end-p1.png`、
`todo009-07-newgame-p1.png` / `-p2.png`、
`todo009-08-after-p2closed-p1.png`。
コンソールログ全文: `~/tmp/playwright-mcp/todo009-console-log.txt`

### 再接続の確認

2 タブを開いたまま `SIGTERM` でサーバを落とし、コンソールを見ると

```
[log] ws.onclose()> retry in 1 sec
[log] ws.onclose()> retry in 2 sec
[log] ws.onclose()> retry in 4 sec
```

と間隔が倍になりながら再試行するログを確認（実装の報告どおり 1→2→4、
上限 10 秒のはずだが、サーバ再起動までの待ち時間の範囲では 4 秒までしか
確認できていない）。

サーバを起動し直すと、**プログラム側から何も操作しなくても**自動で
つながり直った。サーバのログにも新しい接続（`on_connect()`）が記録され、
コンソールにも `ws.onopen()` が出た。盤面のスクリーンショット
（`todo009-recon-03-after-restart-p1.png` など）でも描画が復元されている
ことを確認。

つながり直したあとの操作が反映されるかは、1 回目の試行では
`page.click()` がクリック時のオーバーレイ判定に引っかかって失敗し、
これは**ゲームの `turn` の状態によって Roll ボタンが表示されない
（board の画像がクリックを受けてしまう）ことが原因**で、TODO-009 の
変更とは無関係と判断した（同じ現象は再接続を挟まない素のページでも
再現した）。`new_game()` を呼んで `turn` を両者可能な状態に戻したうえで
再接続後に Roll をクリックすると、

```
p1 console: RollButton.on_mouse_down_xy>player=0
p1 console: RollButton.roll> [d1, d2]=[3, 0]
p1 console: emit_msg> type=dice, data={"player":0,"dice":[0,0,0,5],"roll":true}
p2 console: ws.onmessage:msg={"src":"client","type":"dice",...}
```

と、p1 で振ったダイスが p2 の `ws.onmessage` に届き、スクリーンショット
（`todo009-recon6-roll-p2.png`）でもダイス面が変わっていることを確認した。
**再接続後も操作は両方のタブに反映される。**

再接続に関わったログファイル（`/tmp/ytbg-5099-restart*.log`）はいずれも
`traceback` 0 件。

スクリーンショット追加分: `todo009-recon-01-before-kill-p1.png`、
`todo009-recon-02-after-kill-p1.png`、
`todo009-recon-03-after-restart-p1.png` / `-p2.png`、
`todo009-recon3-01-after-restart-p1.png` / `-p2.png`、
`todo009-recon6-roll-p1.png` / `-p2.png`

## 7. 差分の確認

`git diff --stat`:

```
 pyproject.toml                        |  11 +-
 src/ytbg/__main__.py                  | 124 +++++----
 src/ytbg/webroot/static/ytbg.js       | 259 ++++++++++--------
 src/ytbg/webroot/templates/index.html |   4 -
 src/ytbg/yt_backgammon_server.py      | 260 ++++++++++++------
 tests/conftest.py                     |  97 +++----
 tests/test_history.py                 |  14 +-
 tests/test_on_json.py                 | 154 ++++++-----
 uv.lock                               | 491 ++++++++++++++++++----------------
 9 files changed, 797 insertions(+), 617 deletions(-)
```

依頼の範囲（`pyproject.toml` / `uv.lock` / `src/ytbg/__main__.py` /
`src/ytbg/yt_backgammon_server.py` / `src/ytbg/webroot/templates/index.html` /
`src/ytbg/webroot/static/ytbg.js` / `tests/`）に収まっている。
`CLAUDE.md` / `README.md` / `TODO.md` は変更なし（`git diff` 空）。
`src/ytbg/yt_backgammon.py` も変更なし（`git diff` 空）。

## 確かめられなかったこと・判断が要ること

- **2-(a)**: `broadcast()` の中身をわざと壊しても pytest では検出できない
  （テストが `broadcast()` 自体を monkeypatch で差し替えているため）。
  依頼の 3 パターンのうち唯一これだけ、実装の報告の「壊れているか」を
  ユニットテストでは確認できなかった。ただし 5・6 の実機確認では
  `broadcast()` が複数クライアントへ正しく送っていることを別途確認できて
  いる。テストを直すかどうかは管理者の判断
- 再接続の間隔について、上限の 10 秒まで待っての確認はしていない（1→2→4
  秒までは実測、以降は待っていない）
- playwright は `headless=False` で動いた（表示ありで確認できた。
  `DISPLAY=localhost:10.0` の X 転送が効いていた）
- `on_error()` に落ちると接続が切れる、という実装報告の「判断が要る点 1」
  は、依頼のとおり実装しなおされている（追加の直しで、受信段階の
  JSONDecodeError・on_json() 内の例外では接続を切らないよう変更済み）。
  今回の確認（5 の不正 JSON・data 不足）はこの「追加の直し」後の版に対して
  行っており、いずれも接続は切れなかった
