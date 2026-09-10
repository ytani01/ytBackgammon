# TODO-009 reviewer 報告（2 回目）

1 回目の指摘（`reviewer-report.md`）を受けた直し（R1・C1〜C8）と、
main が書いた文書（`CLAUDE.md` / `README.md` / `TODO.md`）を見た。
**コードは直していない。** 1 回目に「問題が無かった」と書いたところは
繰り返していない。

**要修正: 0 件。** 気になる点 7 件、好みの範囲 3 件。
ほかに M6 の食い違いの原因（分かった）と、決着に向けて記録すべきことを
最後に挙げた。

確認は 5001〜5004 を触らずに行った（4 つとも作業の前後で 200）。
自分で起動したのは 5099 で、終了後にプロセスを PID 指定で止め、
その起動で新しくできた `~/ytbg-99.json` も消した（`~/ytbg-1〜4.json` は
触っていない）。`src/` を壊す確認は毎回バックアップから戻し、
最後に `md5sum` が元と一致することと `git status` が変わっていないことを
確認した。

| コマンド | 結果 |
|----------|------|
| `uv run pytest`（5 回連続 ＋ 3 本同時） | すべて 68 passed。ばらつきなし |
| `uv run ruff check .` | All checks passed |
| `uv run mypy src` | Success: no issues found in 5 source files |

---

## 直しの評価（依頼の「見てほしいところ 1」）

### R1（`asyncio.Lock`）— 妥当。追跡外の Task が残る経路は見つからなかった

- `_replay_task` を触るのは `src/` では 3 箇所
  （`yt_backgammon_server.py:387`、`:395`、`:422`）だけで、いずれも
  `_cancel_replay()` / `_start_replay()` / `_run_replay()` の中。
  `_cancel_replay()` は `_start_replay()`（`:421`）と `_run_replay()`
  （`:436`）からしか呼ばれず、どちらも `async with self._replay_lock:` の
  中にある。**ロックを取らずに `_replay_task` を触る経路は無い**
- `create_task()` はファイル中この 1 箇所だけ（`grep` で確認）。
  ロックの中で「cancel → 待つ → 作る」が一続きなので、待っている間に
  別の要求が割り込む窓は無い
- **デッドロックの恐れは見当たらない。** ロックを握ったまま `await` する
  のは `_cancel_replay()` の `await task` と `_run_replay()` の
  `await func(...)` の 2 箇所で、その先
  （`backward_hist()` / `forward_hist()` → `emit_gameinfo()` →
  `broadcast()` → `send_json()`）に `_replay_lock` を取り直す経路は無い。
  再生 Task 側（`_replay()`）もロックを取らない
- 4 つに分けた構造は読める。`_cancel_replay()` に
  「**`_replay_lock` を持った状態で呼ぶこと**」と書いてあるので、
  非公開メソッドの前提条件としては十分だと考える

**実測（壊して落ちることの確認）。** 実装・verifier がやっていない
壊し方も試した。

| 壊し方 | 結果 |
|--------|------|
| `_start_replay()` から `async with self._replay_lock:` だけを外す（cancel の順序はそのまま） | **1 失敗**（`test_only_one_replay_runs`）。ロックそのものがテストで固定されている |
| `_run_replay()` から `await self._cancel_replay()` を外す | **1 失敗**（`test_running_replay_is_stopped_by_next_request`） |
| `_cancel_replay()` を「cancel するだけで待たない」に変える | **2 失敗**（同上 ＋ `test_cancel_is_not_reported_as_error`） |
| `_cancel_replay()` の `self._replay_task = None` を消す | **0 失敗**（後述 C-5） |

### C1（n > 0 はその場で走らせる）— 妥当

`_run_replay()` がロックを握ったまま `await func(...)` する形なので、
同時に来た 2 通は順番待ちになり、移行前と同じ「2 通なら 2 手」に戻る。
`test_two_back_msgs_move_two_steps` が固定しており、
`_start_replay()` に戻すと落ちることを自分でも再現した。

### C2（`_replay()`）— 動きは正しい。ただし `CancelledError` 節は効いていない

`except asyncio.CancelledError: raise` は**削っても動作が変わらない**。
`asyncio.CancelledError` は 3.8 以降 `BaseException` の直接の子で、
下の `except Exception` には捕まらないため。
実測: この 2 行を消して `uv run pytest` → **68 passed**（1 件も落ちない）。

意図を書き残す目的なら残してよいが、「この節があるから cancel が
`on_error()` に行かない」わけではない。詳細は C-4。

### C3（`gather` ＋ `zip(strict=True)`）— 対応は正しい

`clients = list(self._clients)`（`:116`）でスナップショットを取り、
同じリストから待つものを組み立てて同じリストと `zip` しているので、
**`broadcast()` の途中で `_clients` が変わっても長さがずれることは無い**
（`strict=True` が落ちる経路が無い）。送信中に切れたクライアントは
`send_json()` の例外として warning に出るだけで、`_clients` は触らない
（受信ループの `finally` の担当）。

`return_exceptions=True` でも、**再生 Task を cancel したときは
`gather` が `CancelledError` を投げ返す**（CPython の `gather` は
`_cancel_requested` のとき `return_exceptions` に関係なく cancel を
伝える）。つまり broadcast の最中でも cancel は通る。

### C4・C5・C7 — 妥当

- C4: `await svr.on_connect(websocket)` が `try` の中に入り、
  `finally` の `on_disconnect()` と必ず対になった（`__main__.py:85-116`）
- C5: `wait_replay()` は消え、`src/` からも `tests/` からも参照が無い
  （`grep` 済み）。テストは `bg_server._replay_task` を直接 `await` する
- C7: `WEBROOT` は `src/ytbg/__init__.py:16` の 1 箇所だけになり、
  両モジュールが `from . import WEBROOT` で受けている

---

## 気になる点

### C-1. `_cancel_replay()` は「呼び出し元自身の cancel」も握りつぶす（検討）

`src/ytbg/yt_backgammon_server.py:390-393`

`await task` を包む `except asyncio.CancelledError` は、
**「待っている相手が cancel された」のか「自分が cancel された」のかを
区別できない**。後者だと、cancel を握りつぶしたまま先へ進み、
新しい再生 Task を作って正常終了する。

実測（スクラッチパッドの `exp_swallow.py`。`_start_replay()` を呼ぶ Task を、
`_cancel_replay()` の `await task` の最中に cancel した）:

```
caller.cancelled() = False        ← cancel されたのに正常終了扱い
caller.done() = True exc = None
1本目 cancelled = True
_replay_task is None = False
cancel された呼び出し元が作った新しい Task が走っている = True
```

到達するのは「受信ループの Task が cancel される」場面
（サーバ停止など）に限られ、実害はプロセス終了時に再生 Task が 1 本
残ることぐらいだと考える（**実サーバでの発生は未確認**）。
直すなら `asyncio.current_task().cancelling()` を見るか、`task.cancelled()`
を確かめてから握るといった形になるが、**今回の範囲で直す必要は無い**と
考える。記録だけ残したい。

### C-2. `test_broadcast_keeps_failed_client` は `broadcast()` が空でも通る（検討）

`tests/test_broadcast.py:35-49`

「失敗したクライアントが `_clients` に残る」ことしか見ていないので、
**`broadcast()` の先頭で `return` しても通る**
（実装の M1 が 3 失敗で、このテストが含まれていないのがその証拠。
こちらでも同じ結果を確認した）。「送信が試みられて失敗した」ことを
確かめていないので、たとえば `FakeClient.fail` が効かなくなっても
気づけない。`assert c0.sent == [msg]` を 1 行足すだけで塞がる。

他の 10 件については、狙った箇所を壊すと落ちることを（実装・verifier の
分と合わせて）確認できた。`test_only_one_replay_runs` と同種の
「前提が空で空振りする」穴は、ほかには見つからなかった。

### C-3. 「同じクライアントへの順序は入れ替わらない」は言い過ぎ（検討）

`src/ytbg/yt_backgammon_server.py:120-123` のコメントは実態どおりだが、
`tests/test_broadcast.py:52-58` の docstring と実装の報告にある
「**呼び出し側が await するので、次の broadcast は前の送信が終わってから
始まる**」は、**呼び出し元が 1 つのときにしか成り立たない**。
実際には再生 Task と各クライアントの受信ループが**同時に**
`broadcast()` を呼ぶ（再生中に `put_checker` が来る場面がまさにそれ）。

実測（スタブのクライアントで、1 通目だけ送信に時間がかかる状況を作った。
`exp_order2.py`）:

```
received: ['B', 'A'] (呼び出し順は A -> B)
```

ただしこれはスタブでの話で、**本物の WebSocket で追い越しが起きるかは
未確認**（websockets は frame を書いてから drain を待つので、実際には
起きにくいと考えている）。テストは順に呼んだ場合しか見ていないので、
**docstring を「順に呼んだ場合の順序」に限定して書くのが正確**。
移行前（socket.io のクライアントごとのキュー）は呼び出し順で並んでいた
ので、ここは移行前との差として残る。

### C-4. `_replay()` の `CancelledError` 節が効いていないことを書いていない（検討）

`src/ytbg/yt_backgammon_server.py:407-408`。上の「C2」に書いたとおり
削っても 68 passed のまま。docstring の
「cancel は正常な停止なので例外として扱わない」は結果として正しいが、
根拠はこの 2 行ではなく `CancelledError` が `BaseException` 側にあること。
残すなら「`except Exception` では捕まらないことを明示するために書いている」
と分かる形にしたい。

### C-5. n > 0 の再生中は `_replay_task` が `None`（検討）

`_run_replay()` は `_cancel_replay()` を通るので `_replay_task` を
`None` にしてから、その場で再生を走らせる。つまり
**再生中なのに「走っていない」ように見える**。
`_cancel_replay()` の `self._replay_task = None`（`:395`）を消しても
テストが 1 件も落ちないのはこのため（この代入は今のところ
「後片付け」以上の意味を持っていない）。

今は困らないが、「再生中か」を判定するコードを足すときに引っかかる。
決着の記録に残しておきたい。

### C-6. ロックを握ったままの `broadcast()` が、詰まったときの影響を広げる（検討）

`_run_replay()` はロックを握ったまま `broadcast()` まで到達する。
C3 で残した「いちばん遅いクライアントを待つ」制約と重なると、
**1 つ詰まっただけで、他のクライアントの `back` / `fwd` / `back_all` が
`_replay_lock` 待ちになり、その受信ループも止まる**。
移行前（クライアントごとのキュー）には無かった性質。

利用者が「いちばん遅いクライアントを待つ制約は残す」と決めている以上
この項目で直すものではないが、**キュー化を検討するときの材料**なので
記録に残したい（`TODO.md` の TODO-004 に「同じ性質の話」として
触れてはある）。

### C-7. 文書の細かい食い違い（検討）

- `CLAUDE.md:163-166`「**1 手だけの `back` / `fwd`（n > 0）**」——
  n は 1 とは限らない（`tests/test_on_json.py` は n=2 で試している。
  `ytbg.js` が n=1 しか送らないのは、その次の文が書いているとおり）。
  「n 手ぶんの `back` / `fwd`（n > 0）」が正確
- `broadcast()` に残る「いちばん遅いクライアントを待つ」制約が
  `CLAUDE.md` に無い。TODO-004 の中と `archives/` にしか残らないので、
  `archives/` を現行仕様として参照しない運用だと辿れなくなる。
  「状態と通信」の節に 1 行あってもよい

そのほかは実態と合っていた。確かめたもの:

- uvicorn の既定 `ws_ping_interval = 20.0`（`uvicorn.Config` の署名を
  実測。バージョンは 0.52.4）
- 再接続は `WS_RETRY_SEC_MIN = 1` から倍、`WS_RETRY_SEC_MAX = 10` で
  頭打ち（`ytbg.js:70-72, 4187-4190`）。WebSocket のパスは `/ws`
  （`ytbg.js:4160`、`__main__.py:123`）
- `-d` 無しで起動したときのログに uvicorn 自身の行が出ないこと
  （5099 で実測。出たのは loguru の 3 行だけ）
- 受信ループの例外の分け方の説明（`__main__.py:88-114` と一致）
- テストの注意書き（`asyncio_mode = "auto"`、`no_sleep` が
  `asyncio.sleep(0)` を呼ぶこと、`bg_server` と `bg_server_raw` の
  使い分け、`await bg_server._replay_task`）はすべてコードと一致
- 履歴の節の説明（Task、`_replay_lock`、n > 0 をロックのまま走らせる
  理由）もコードと一致
- 移行前の説明の残り: `git grep -i 'flask|gevent|socket.io|_repeat_flag|
  time.sleep|werkzeug|monkey'（`archives/` を除く）で出るのは、
  `.gitignore` のコメントと、「移行前はこうだった」と断って書いてある
  箇所だけ
- 造語や、このリポジトリで使っていない言い回しは見つからなかった。
  日本語も直訳調になっていない

---

## M6 の食い違い（依頼の「見てほしいところ 3」）— 原因が分かった

**verifier の 6 件が、依頼どおりの壊し方（`back` と `fwd` の 2 箇所を
戻す）の結果として正しい。実装の 4 件は、`back` の 1 箇所だけを戻した
ときの結果と完全に一致する。**

実測（同じ working tree で、壊し方だけを変えて `uv run pytest`）:

| 壊し方 | 結果 |
|--------|------|
| `back` と `fwd` の両方を `_start_replay()` に戻す | **6 失敗**（`test_back_moves_history_by_n` / `test_back_sends_sec_for_checker_move` / `test_fwd_moves_history_by_n` / `test_back_moves_hist_i_by_n` / `test_running_replay_is_stopped_by_next_request` / `test_two_back_msgs_move_two_steps`）＝ verifier と一致 |
| `back` だけを `_start_replay()` に戻す | **4 失敗**（`test_back_moves_history_by_n` / `test_back_sends_sec_for_checker_move` / `test_back_moves_hist_i_by_n` / `test_two_back_msgs_move_two_steps`）＝ 実装の報告の「`test_two_back_msgs_move_two_steps` ほか 3 件」と一致 |

`fwd` を戻さないと `test_fwd_moves_history_by_n` と
`test_running_replay_is_stopped_by_next_request`（fwd n=1 を使う）が
落ちないので、差はちょうどこの 2 件。**コードにもテストにも問題は無く、
壊し方の範囲が違っただけ**と考えてよい。

---

## 好みの範囲

- `tests/conftest.py:79-109` — `FakeWebSocket` と `FakeClient` が
  ほぼ同じ役割で 2 つある。`req` フィクスチャも `FakeClient` で足りる
- `tests/test_broadcast.py:15` — `from conftest import FakeClient`。
  今は動くが、`tests/__init__.py` を足した途端に壊れる。
  フィクスチャで渡すか `tests` 配下の別モジュールに置くほうが素直
- `tests/test_history.py:9, 46` — `await` を 1 つも含まないテストまで
  `async def` にしている（`asyncio_mode = "auto"` なので同期のままでも
  動く）

---

## 決着に向けて（依頼の「見てほしいところ 5」）

### 記録に残したいこと（報告に無いもの）

1. **M6 の食い違いの原因**（上のとおり。壊した範囲の違い）
2. `_cancel_replay()` が呼び出し元自身の cancel も握りつぶす（C-1）
3. n > 0 の再生中は `_replay_task` が `None` で、「再生中か」を
   外から見分けられない（C-5）
4. ロックと `broadcast()` の待ちが重なると、詰まったクライアント 1 つで
   他のクライアントの再生要求と受信ループまで止まる（C-6）
5. 「同じクライアントへの順序」は、`broadcast()` を順に呼んだ場合の
   話であること（C-3）
6. `asyncio.Lock()` を `__init__`（＝イベントループの外）で作れるのは
   Python 3.10 以降の性質に依っていること。
   `requires-python >= 3.14` なので今は問題無いが、`asyncio.Queue` など
   ループに結びつくものを同じ場所に足すときに引っかかる

### `TODO.md` の後始末（決着させるとき）

- TODO-009 のチェックボックスが 5 つとも未チェックのまま。
  確かめてからチェックする（`index.html` の CDN 読み込み削除、
  `ytbg.sh` は「直す必要が無かった」ことの記録も要る）
- 冒頭の「残っている項目: TODO-004、TODO-009、TODO-010」と
  「これまでに 11 件」の更新
- TODO-009 の「やること」に書いてある `_client_sid` は、実装では
  `_clients` になった。決着のファイルには実際の名前で残したい

### 新しく項目を立てたほうがよいと思うもの（立てるかは利用者の判断）

- **クライアントごとの送信キュー。** C3 で残した「いちばん遅い
  クライアントを待つ」制約と、C-6 の波及をまとめて扱う。
  TODO-004（`save_data()` の停止時間）と同じ「1 か所の待ちが全体を
  止める」話なので、**まず測る**ところを一緒にやると効率がよい
- **n > 0 の `back` / `fwd` も cancel できるようにする。**
  利用者が「このままにする」と決めた件だが、Task にして `await` する
  形にすれば C1 の要件を満たしたまま cancel も効く、という道筋は
  実装の報告に残っている。今すぐ要るものではない
