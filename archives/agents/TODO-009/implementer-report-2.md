# TODO-009 implementer 報告（2 回目）

reviewer の R1・C1〜C8 と、好みの範囲 3 件を直した。commit はしていない。
5001〜5004 は触っていない（最後に 4 つとも 200 を返すことを確認した）。
自分の確認は 5099 と、サーバを起動しないスクラッチパッドのスクリプトで行った。

## R1. 連続再生の cancel の競合

`src/ytbg/yt_backgammon_server.py`

- `self._replay_lock = asyncio.Lock()` を追加（`:61-63`）。
  **`_replay_task` の差し替えと cancel は、必ずこのロックの中で行う**
- `_cancel_replay()`（`:376-392`）は「cancel して待ってから
  `_replay_task = None`」に変え、docstring に
  「ロックを持った状態で呼ぶこと」と書いた
- `_start_replay()`（`:409-421`）は
  `async with self._replay_lock:` の中で `_cancel_replay()` →
  `create_task()` をまとめて行う。`await` を挟んでも、その間に別の
  要求が入り込めるのはロックの手前までなので、**辿れない Task は
  作られない**

ロックにしたのは、reviewer の言うとおり「`_replay_task = None` の
位置を変えるだけでは窓が閉じない」ため。窓（cancel を待つ `await`）を
なくすのではなく、その区間に 1 本しか入れないようにした。

**実測**（reviewer と同じ形。`asyncio.gather()` で 2 本の `on_json()` を
同時に流す。スクラッチパッドの `r1_repro.py`）:

```
R1 start: _history=11, _fwd_hist=10
R1 直後: 生存 Task=1, _replay_task 以外=0
R1 10 秒後: 生存 Task=0, その間の broadcast=13 通, _history=21, _fwd_hist=0
```

直す前は「生存 Task 2 本（うち 1 本は追跡外）、10 秒後も両方走ったまま、
その間に 203 通」だった。今は追跡外の Task は 0 本で、10 秒待つ前に
決着している（最後に来た `fwd_all` が最後まで走った）。

サーバを起動しての実測（`wstest2.py`。走行中の `fwd_all` に
`back_all` と `fwd_all` を 2 クライアントから同時にぶつけた）:

```
4 同時要求: そのあと 11 通で落ち着いた (hist_i=11, hist_n=11)
4 さらに 3 秒後: 追加の broadcast=0 通 (0 なら打ち消し合っていない)
```

## C1. `back` / `fwd`（n > 0）が同時に来ると 1 手ぶん失われる

`_run_replay()` を追加（`:423-435`）。前の再生を止めてから、
**ロックを握ったまま `await func(...)` でその場で走り切る**。
`on_json()` の `back` / `fwd`（n を渡す 2 箇所、`:463-465` と `:478-480`）を
`_start_replay()` から `_run_replay()` に替えた。
`back2` / `back_all` / `fwd2` / `fwd_all`（n = 0）は今までどおり
`_start_replay()` で Task にする（再生中も他のメッセージを処理するため）。

reviewer の書いた「n > 0 は Task にせず `await` して返す形」に沿って
いるが、走らせる間もロックを握るようにした。こうすると、
n > 0 の実行中に別の再生要求が来ても順番待ちになるので、
**再生が同時に 2 本走る状態そのものが無くなる**。

例外は `on_json()` の呼び出し元へ抜けるので、移行前と同じく受信ループの
受け皿から `on_error()` へ届く。

**実測**（履歴 31 件で `back`(n=1) を 2 通同時）:

```
C1 back(n=1) x2 同時: _history=29, broadcast=2 通
```

サーバ経由でも `5 back(n=1) を 2 通同時: broadcast=2 通, hist_i 11 -> 9`。
移行前と同じ「2 通なら 2 手」に戻った。

## C2. 再生 Task の例外が `on_error()` に届かない

`_replay()`（`:394-407`）を追加し、`create_task()` はこの
コルーチンを包むようにした。中で `func()` を `await` し、

- `asyncio.CancelledError` → そのまま再送出（正常な停止なので
  エラー扱いしない）
- それ以外の例外 → `self.on_error(None, e)`

`on_error()`（`:369-374`）に docstring を足し、
「特定のクライアントに紐づかない場合は `ws` が `None`」と書いた。
`client_name(None)` は `'?'` を返すので、ログの書式は変えていない。

**実測**（再生の本体で `ValueError` を起こす）:

```
C2 再生 Task の例外: on_error 呼び出し=1 件, None, ValueError
```

`Task exception was never retrieved` は stderr に出ない
（サーバのログでも `grep -c 'never retrieved'` = 0）。

## C3. `broadcast()` の並行化

`:106-135`。`asyncio.gather(*[ws.send_json(msg) for ws in clients],
return_exceptions=True)` にし、返ってきた例外を
`zip(clients, results, strict=True)` で突き合わせて warning に出す
（どのクライアントで何が起きたかが分かる）。

- **同じクライアントへの順序は入れ替わらない。**
  `broadcast()` 自体は呼び出し側が `await` するので、次の broadcast は
  前の送信が全部終わってから始まる。
  `tests/test_broadcast.py::test_broadcast_keeps_order_per_client` で
  5 通を順に送り、2 クライアントとも順序どおりに受け取ることを固定した
- **残る制約**: これでも「いちばん遅いクライアントを待つ」点は消えない。
  1 つが詰まると、その `send_json()` が返るまで `broadcast()` が
  終わらず、次の broadcast も再生の次の 1 手も始まらない。
  消すにはクライアントごとの送信キューが要る（この項目ではやらない）

## C4. `on_connect()` が `try` の外

`src/ytbg/__main__.py:53-57`。`accept()` の直後の
`await svr.on_connect(websocket)` を `try` の中へ移した。
`finally` の `on_disconnect()` が必ず対になる。

## C5. `wait_replay()`

**消した。** テストは `bg_server._replay_task` を直接 `await` する。
`src/` から呼ばれない公開メソッドを増やさない方を採った（依頼の
「公開メソッドを増やさない形を優先する」に従った）。
n > 0 の `back` / `fwd` は C1 の直しで Task にならなくなったので、
そもそも待つ必要が無くなり、待つのは n = 0 の 4 つだけになった。
複数の type をまとめて回すテストでは
`if bg_server._replay_task is not None: await bg_server._replay_task`。

## C7. `WEBROOT` の定義

`src/ytbg/__init__.py:13-16` に置き、`__all__` に足した。
`__main__.py` と `yt_backgammon_server.py` は
`from . import WEBROOT` で受ける。`monkey.patch_all()` が無くなり、
`__init__.py` に置ける物の制約が消えたので、パッケージの定数として
1 箇所にまとめられる。`__init__.py` が新しく引き込むのは
`pathlib` だけ。

## 好みの範囲

- `yt_backgammon_server.py:133` — warning のクライアント名を
  `self.client_name(ws)` に揃えた（未登録なら `'?'`）
- `yt_backgammon_server.py:134` — warning の書式の末尾の `.` を落とした
  （`'{}: {}:{}'`）。reviewer の「他のログに無い」に合わせた。
  ただし `load_data()` / `save_data()` の warning には `.` が残っている
  ので、**ファイル全体では揃っていない**。そちらも落とすかは
  この項目の範囲外と判断した
- `ytbg.js:4238` — `board.roll_btn[...].set(` の継続行を開き括弧に揃えた

## C8. 足したテスト

`uv run pytest` は **68 passed**（57 → 68。11 件増えた）。

### `tests/test_broadcast.py`（新規、6 件）

`bg_server` フィクスチャは `broadcast()` を丸ごと差し替えるので、
`broadcast()` の中身が動かない（verifier の指摘）。差し替えていない
`bg_server_raw` フィクスチャ（`tests/conftest.py` に追加）と、
`send_json()` を持つ `FakeClient`（同）を使う。

| テスト | 見るもの |
|--------|----------|
| `test_broadcast_reaches_all_clients_even_if_one_fails` | 3 つのうち真ん中が例外を投げても残り 2 つに届く |
| `test_broadcast_keeps_failed_client` | 失敗したクライアントは `_clients` に残る（外すのは受信ループの担当） |
| `test_broadcast_keeps_order_per_client` | 同じクライアントへの順序が入れ替わらない（C3） |
| `test_on_connect_registers_and_sends_gameinfo_to_all` | `_clients` に入り、gameinfo が**全員へ**飛ぶ |
| `test_on_disconnect_removes_client` | `_clients` から抜け、以後は送られない |
| `test_on_disconnect_unknown_client_is_ignored` | 未登録の WebSocket を渡しても壊れない |

### `tests/test_replay.py`（新規、5 件）

| テスト | 見るもの |
|--------|----------|
| `test_running_replay_is_stopped_by_next_request` | 走行中の `back_all` に `fwd` をぶつけると前が止まり、後だけが進む |
| `test_only_one_replay_runs` | R1 の再現形（走行中の `back_all` に `back_all` と `fwd_all` を同時）。追跡外の Task が残らず、打ち消し合わない |
| `test_two_back_msgs_move_two_steps` | C1 の再現形（`back` n=1 を 2 通同時）。2 手戻り、broadcast も 2 通 |
| `test_replay_error_goes_to_on_error` | 再生 Task の例外が `on_error()` へ届く（C2）。`ws` は `None` |
| `test_cancel_is_not_reported_as_error` | cancel は `on_error()` に渡さない（C2） |

`test_only_one_replay_runs` は、**`_history` と `_fwd_hist` の両方に
中身がある状態**で始める必要があった。片方が空だと、追跡外の Task が
残っても 1 手も進めずに終わってしまい、打ち消し合いが再現しない
（最初に書いた版はこれで、壊しても落ちなかった。下の M5 で気づいて
直した）。

### 壊して落ちることの確認

`src/ytbg/yt_backgammon_server.py` を 1 箇所ずつ壊し、毎回
`\cp` で戻した（最後に md5sum が元と一致することを確認済み）。

| 壊し方 | 結果 |
|--------|------|
| M1: `broadcast()` の先頭で `return` | **3 失敗**（`..._reaches_all_clients...` / `..._keeps_order_per_client` / `test_on_connect_registers_and_sends_gameinfo_to_all`）。verifier が「1 件も落ちない」と報告した壊し方 |
| M2: `gather` をやめ、直列で例外を握らない | **2 失敗**（`..._reaches_all_clients...` / `..._keeps_failed_client`） |
| M3: `on_connect()` が送信元だけに送る | **1 失敗**（`test_on_connect_registers_and_sends_gameinfo_to_all`） |
| M4: `on_disconnect()` が `_clients` から外さない | **1 失敗**（`test_on_disconnect_removes_client`） |
| M5: R1 の直し前に戻す（ロック無し、先に `_replay_task = None`） | **1 失敗**（`test_only_one_replay_runs`） |
| M6: C1 の直し前に戻す（n > 0 も Task に） | **4 失敗**（`test_two_back_msgs_move_two_steps` ほか 3 件） |
| M7: C2 の直し前に戻す（`_replay()` で包まない） | **1 失敗**（`test_replay_error_goes_to_on_error`） |
| M8: `_cancel_replay()` が cancel しない | **3 失敗**（`test_running_replay_is_stopped_by_next_request` / `test_only_one_replay_runs` / `test_cancel_is_not_reported_as_error`） |

## 検証

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 68 passed（終了コード 0）。警告なし |
| `uv run ruff check .` | All checks passed（0 件） |
| `uv run mypy src` | Success: no issues found in 5 source files |
| `./ytbg.sh -d -p 5099 -i images1a 99` | `/` `/p1` `/p2` すべて 200 |
| WebSocket 2 本（`wstest2.py`） | 下記 |
| サーバのログ | traceback 0 件、`never retrieved` 0 件 |

```
1 A connect: gameinfo / 1 B connect: gameinfo
1 A gets gameinfo on B connect: gameinfo
2 put_checker x10: 両方に同じものが届いた
3 back_all の再生: gameinfo 10 通, 再生中の dice が届いた=True
4 同時要求: そのあと 11 通で落ち着いた (hist_i=11, hist_n=11)
4 さらに 3 秒後: 追加の broadcast=0 通
5 back(n=1) を 2 通同時: broadcast=2 通, hist_i 11 -> 9
6 不正な JSON のあとも往復できる: dice close_code= None
```

5001〜5004 は最後に `curl` で 200 を確認した（触っていない）。

## 判断が要る点・気づいたこと

1. **n > 0 の `back` / `fwd` は、走っている間ロックを握る。**
   その間に来た再生要求は順番待ちになる（拒否ではなく待ち）。
   n = 1 なら 1 手で終わるので待ち時間はほぼ無いが、大きい n を
   投げると、その間の再生要求が待たされる。今の `ytbg.js` は
   `back` / `fwd` に n = 1 しか送っていない
2. **`_run_replay()` の実行中は cancel できない**（`_replay_task` に
   入らないため）。移行前は `_repeat_flag` で n > 0 のループも
   止められた。n = 1 では差が出ないが、挙動としては違う。
   止められるようにするなら、n > 0 も Task にしたうえで
   「作った Task を `await` して返す」形にすればよい（C1 の要件は
   それでも満たせる）。今の形にしたのは単純さを採ったため
3. **C3 の残る制約**（遅いクライアントが全体を待たせる）は消えていない。
   上に書いたとおり、キュー化が要る
4. **好みの範囲の `.` の統一**は、reviewer が挙げた 1 行だけ直した。
   `load_data()` / `save_data()` の warning には `.` が残っている
5. **C6（受信ループが `__main__.py` にある）は直していない。**
   依頼の「触らないもの」に文書が含まれており、コードを `svr` 側へ
   寄せるかは main の判断だと理解した。今回の直し（C4）でも
   ループの置き場所は変えていない

## 3 回目の直し

reviewer の 2 回目の報告（C-2、C-3、C-4、好みの範囲 2 件）と、
`test_history.py` の `async def` を直した。commit はしていない。

### C-2. `test_broadcast_keeps_failed_client` の穴

`tests/test_broadcast.py:33-52`。送る msg を変数に取り、

```python
    assert c0.sent == [msg]
    assert c1.sent == []
```

を足した。「失敗しなかった側には届いている」「失敗した側には
積まれていない」を見るので、送信が試みられたことまで固定される。

**壊して確認**: `broadcast()` の先頭に `return` を入れると、
前回の 3 件に加えてこのテストも落ち、**4 failed, 64 passed** になった
（`test_broadcast_reaches_all_clients_even_if_one_fails` /
`test_broadcast_keeps_failed_client` /
`test_broadcast_keeps_order_per_client` /
`test_on_connect_registers_and_sends_gameinfo_to_all`）。
確認後、バックアップから戻して 68 passed に戻ることを確認した。

### C-3. 順序の話を限定した

`tests/test_broadcast.py:54-64` の docstring を、
「`broadcast()` を順に（前のを await してから次を）呼べば、各
クライアントにはその順で届く」に直し、
「**同時に 2 箇所から `broadcast()` を呼んだ場合はこの限りではない**
（再生 Task と受信ループが同時に呼ぶ場面がある）」を書き足した。
テストの中身は変えていない（順に呼ぶ場合しか見ていないので、
docstring がそのとおりになった）。

`broadcast()` 側のコメント（`yt_backgammon_server.py:117-121`）は
「詰まったクライアントが 1 つあっても、他の送信が始まるのを待たせない
ように並行に送る」としか書いておらず、順序の主張はしていないので
そのままにした。

**なお、この報告の C3 の節に書いた「呼び出し側が await するので、次の
broadcast は前の送信が終わってから始まる」も、呼び出し元が 1 つの
ときにしか成り立たない。** 上のとおり訂正する。

### C-4. `_replay()` の `CancelledError` 節

`src/ytbg/yt_backgammon_server.py:394-411`。docstring から
「cancel は正常な停止なので例外として扱わない」を外し、
`except asyncio.CancelledError: raise` の側にコメントを移した。

```python
        except asyncio.CancelledError:
            # CancelledError は BaseException 側なので、下の
            # except Exception には元々捕まらない。cancel を
            # エラー扱いしないことを読んで分かるように書いてある
            raise
```

### 好みの範囲（`tests/`）

- `FakeWebSocket` を消し、`FakeClient` に寄せた（`tests/conftest.py:79-105`）。
  `req` フィクスチャも `FakeClient('req')` を返す。`FakeClient` の
  docstring に「`_clients` のキーにするのでハッシュ可能であること」
  （`types.SimpleNamespace` が使えなかった理由）を移した
- `tests/test_broadcast.py` の `from conftest import FakeClient` をやめ、
  `make_client` フィクスチャ（`tests/conftest.py:118-126`。`FakeClient`
  そのものを返す）から受け取る形にした。`tests/__init__.py` を足しても
  壊れない

### `test_history.py` の `async def`

`await` を含まない `test_add_history_appends_with_incrementing_sn` と
`test_hist_ent2str_contains_sn` を同期の `def` に戻した
（`tests/test_history.py:9, 46`）。残る 2 件は
`backward_hist()` / `forward_hist()` を await するので `async def` のまま。

### 検証

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 68 passed（終了コード 0） |
| `uv run ruff check .` | All checks passed |
| `uv run mypy src` | Success: no issues found in 5 source files |

`src/` の変更は C-4 のコメントだけなので、サーバの起動確認はやり直して
いない（挙動は変わらない）。5001〜5004 は触っていない。
