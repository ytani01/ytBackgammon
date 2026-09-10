# TODO-009 reviewer 報告

ブランチ `starlette`、working tree（未 commit）の `git diff` を対象に、
規約（利用者全体・プロジェクトの `CLAUDE.md`）と設計への適合、
移行前との挙動の差を見た。**コードは直していない。**

実測は 5001〜5004 を触らずに行った（サーバを起動せず、
スクラッチパッドのスクリプトで `ytBackgammonServer` を直接動かした）。
`uv run ruff check .` = All checks passed、`uv run mypy src` = 0 件は
こちらでも確認した。

**要修正: 1 件。** ほかに検討 8 件、好みの範囲 3 件、
文書の直し（main の担当）を最後にまとめた。

---

## 要修正

### R1. 連続再生の cancel に競合があり、止められない再生 Task が残る

`src/ytbg/yt_backgammon_server.py:367-390`
（`_cancel_replay()` / `_start_replay()`）

`_cancel_replay()` は先頭で `self._replay_task = None` にしてから
`await task` で相手の終了を待つ。この **`await` の間に別の
`_start_replay()` が入ると、そちらは `_replay_task is None` を見て
即座に新しい Task を作る**。待っていた側もそのあと Task を作って
`_replay_task` を上書きするので、**`_replay_task` から辿れない再生 Task が
残る**。

実測（`asyncio.gather()` で 2 本の `on_json()` を同時に流した）:

- 走行中の `back_all` に、`back_all` と `fwd_all` を同時にぶつけると、
  **生存 Task が 2 本、うち 1 本は `_replay_task` 以外**になった
- その 2 本は逆方向なので互いに打ち消し合い、**10 秒後も両方走ったまま、
  その間に `gameinfo` を 203 通 broadcast した**（`_history=18`,
  `_fwd_hist=3` で行ったり来たり）
- 追跡外の Task は、そのあとどの `back` / `fwd` を送っても
  `_cancel_replay()` の対象にならない（`_replay_task` しか見ていない）

**移行前との差。** 移行前は `_repeat_flag` が 1 つの共有フラグで、
新しい要求が `False` を書けば**走っている全てのループが止まった**
（`while ... and self._repeat_flag`）。同時要求で 2 本が同時に回る状態は
移行前も起こり得たが、**もう一度どれかのボタンを押せば全部止められた**。
今は止める手段が無い。依頼の「止まり方と、止めたあとの状態が移行前と
同じか」に対して、**止め方が変わっている**。

根拠: 上記の実測と、`git diff` の移行前コード
（`while self._repeat_flag: self._repeat_flag = False; time.sleep(.5)`）。

直し方は書かないが、`_replay_task = None` を「cancel が終わったあと」に
するだけでは足りない（`await` を挟む限り同じ窓が空く）ことだけ補足する。

---

## 検討

### C1. `back` / `fwd`（n > 0）が同時に来ると 1 手ぶん失われる

`src/ytbg/yt_backgammon_server.py:382-390`、`411-423`

n > 0 の 1 手ぶんも Task にしたため、Task が走り出す前に次の要求が来ると
`_cancel_replay()` に潰される。

実測: 履歴 11 件の状態で、別々のクライアントから
`back`（n=1）を同時に 2 通処理させると、**`_history` は 11 → 10
（1 手ぶんしか戻らない）、broadcast も 1 通だけ**だった。
移行前は `backward_hist()` が同期に走り切ってから `on_json()` が返って
いたので、2 通なら 2 手戻った。

R1 と根は同じ（`_start_replay()` の窓）だが、症状と直し方は別。
n > 0 は Task にせず `await` して返す形なら、呼び出し側から見た順序も
移行前と同じに戻る。**同じクライアントからの連打では起きない**
（1 本の接続の受信ループは `on_json()` を待ってから次を受けるため）ので、
影響は「2 人が同時に押したとき」に限られる。

### C2. 再生 Task の中の例外が `on_error()` に届かない

`src/ytbg/yt_backgammon_server.py:388`（`create_task` の戻りを誰も
retrieve しない）、`392-402`（`wait_replay()` は `asyncio.wait()` なので
例外を取り出さない）

実測: 再生の本体で `ValueError` を起こすと、`svr.on_error()` は呼ばれず、
`wait_replay()` も何も投げない。Task が GC されたときに asyncio の
既定ハンドラが **`Task exception was never retrieved` + traceback を
stderr へ**出すだけになる（loguru の書式ではない、出るタイミングも
GC 任せ）。

移行前は `backward_hist()` の例外が Flask-SocketIO の
`on_error_default` → `svr.on_error()` へ届いていた。
実装の報告で「`on_error_default` に当たる受け皿」を用意したと書いて
いるのは受信ループの中だけで、**Task にした再生はその外**にある。
`__main__.py` の受信ループの `except` は Task には効かない。

### C3. `broadcast()` が 1 クライアントずつ `await` するので、詰まった
クライアントが全員を止める

`src/ytbg/yt_backgammon_server.py:115-124`

`await ws.send_json(msg)` を直列に回すため、送信バッファが埋まった
クライアントが 1 つあると、その drain を待つ間、他のクライアントへの
送信も、再生 Task も進まない。移行前の Flask-SocketIO はクライアントごとの
キューへ積む形だったので、ここは作りが変わっている。

**未確認**（実測していない）。インターネット越しに使う前提（`TODO.md`）
なので、判断だけは残しておきたい。気になるなら
`asyncio.gather(*[...], return_exceptions=True)` で並べる手がある。

### C4. 送信に失敗したクライアントが `_clients` に残る経路

`src/ytbg/yt_backgammon_server.py:115-124`、`src/ytbg/__main__.py:56-84`

「外すのは受信ループの `finally` に任せる」という判断そのものは妥当
（二重管理を避けられる）。コードを読んだ限り、送信が失敗する状況では
受信側も必ず `WebSocketDisconnect` か `RuntimeError`
（`Cannot call "receive" once a disconnect message has been received.`）を
受け取り、どちらも受信ループを抜けて `finally` へ落ちるので、
通常の切断で残り続ける経路は見当たらなかった。

ただし **1 箇所だけ `finally` の外**がある。`__main__.py:54` の
`await svr.on_connect(websocket)` は `try` の前にあり、`on_connect()` は
`self._clients[ws] = name` を先に書いてから `await emit_gameinfo(0)` する。
ここで `CancelledError`（サーバ停止時など）が飛ぶと、
`on_disconnect()` が呼ばれず `_clients` に残る。
プロセスが終わる場面に限られるので実害は小さいが、`on_connect()` を
`try` の中へ入れれば消える。**未確認**（実測していない）。

### C5. `wait_replay()` が本番から呼ばれないテスト専用 API

`src/ytbg/yt_backgammon_server.py:392-402`

`grep` した限り、呼び出しは `tests/test_on_json.py` の 10 箇所だけで、
`src/` からは呼ばれない。依頼が「足したなら報告に書く」と許容していた
範囲ではあるが、公開メソッドとして残すか、テストが
`bg_server._replay_task` を直接待つ形にするかは判断が要る。
（`_history` などテストが `_` 付きを直に触っている前例はある）

### C6. 受信ループのエラー方針が `__main__.py` に降りてきている

`src/ytbg/__main__.py:47-84`

プロジェクトの `CLAUDE.md`「構成」は
「`__main__.py` は…ルーティングと SocketIO のイベント登録**だけ**を行い、
処理は `svr` に委譲する」と書いている。今の `__main__.py` は
30 行以上の受信ループと、例外の種類ごとの続行・切断の判断を持っている。

移行の都合で自然な形ではあるが、**現状の記述とは食い違う**ので、
ループごと `svr` 側へ寄せるか、`CLAUDE.md` の記述を書き換えるかを
決める必要がある（文書は main の担当）。

分け方そのもの（`WebSocketDisconnect` → 抜ける、`JSONDecodeError` →
続ける、受信段階のその他 → 抜ける、`on_json()` の中 → 続ける）は
読んだ限り妥当で、**無限ループになる経路は見当たらなかった**
（`continue` する経路も必ず `await receive_json()` で待つため、
ビジーループにはならない）。`CancelledError` は `Exception` の
サブクラスではないので、どの `except Exception` にも捕まらず、
cancel は通る（`finally` の `on_disconnect()` は await 点を持たないので
cancel 中でも走り切る）。

### C7. `WEBROOT` の定義が 2 つのモジュールに分かれた

`src/ytbg/__main__.py:31`、`src/ytbg/yt_backgammon_server.py:23-24`

同じ `Path(__file__).absolute().parent / 'webroot'` が両方にある。
`static/` は `__main__.py`、`templates/` は `yt_backgammon_server.py` と、
webroot の知識が 2 箇所に散った。片方に寄せる（例: サーバ側へ
テンプレートのパスを渡す）かどうかは判断が要る。

### C8. テストの網から漏れたところ（verifier の指摘の続き）

`tests/conftest.py:133-140` が `ytBackgammonServer.broadcast` を丸ごと
差し替える設計そのものは妥当だと考える。

- 移行前の `emit()` 差し替えは「`emit()` の呼び方（`broadcast=True`）」
  まで見られたが、これは flask_socketio の API を検証していたに等しい
- 今の形でも「`on_json()` が全員へ送るメソッドを呼ぶこと」は固定できて
  いる。`await ws.send_json(msg)`（送信元だけ）に書き換えれば
  `emitted` が空になって落ちるので、TODO-013 で塞いだ穴は塞がったまま

漏れているのは **`broadcast()` の中身と、接続管理まわり**で、
今回そこに新しいロジックが増えている。足すなら次の形が要ると考える。

1. `broadcast()` 単体: `send_json` を持つスタブを 3 つ `_clients` に入れ、
   真ん中が例外を投げても**残り 2 つに届く**こと、失敗した 1 つが
   `_clients` に残ること（C4 の判断をテストで固定する）
2. `on_connect()` / `on_disconnect()`: `_clients` に入る・抜ける、
   接続時に**全員へ** `gameinfo` が飛ぶこと（送信元だけに変えたら
   落ちること）。移行前は request コンテキストが要って書けなかったが、
   今は素のオブジェクトで書ける
3. 再生の cancel: 走っている `back_all` に `fwd` をぶつけると
   前が止まって後が走ること（R1・C1 を直すなら、その回帰も含めて）

いずれも「テストが通ることだけを見ない」（`CLAUDE.md`）に沿って、
`src/` を壊して落ちることまで確かめてほしい。

---

## 好みの範囲

- `src/ytbg/yt_backgammon_server.py:123` — `self._clients.get(ws)` は
  未登録なら `None` が出る。同じ用途の `client_name()`（`'?'` を返す）と
  揃えたほうが読みやすい
- `src/ytbg/yt_backgammon_server.py:126` — warning の書式
  `'{}: {}:{}.'` の末尾の `.` は他のログに無い（`load_data()` の
  warning には有る）。統一されていないだけで害は無い
- `src/ytbg/webroot/static/ytbg.js:4237-4238` — `board.roll_btn[...].set(` の
  継続行が、字下げが深くなったぶんだけ開き括弧とずれた。
  ロジックには影響しない

---

## 見て問題が無かったところ

- **`on_json()` の分岐ごとの振る舞い**: `git diff` で 1 つずつ突き合わせた。
  更新するもの・送るもの・履歴を積む条件（末尾の `history` 判定と
  `add_history`）はすべて同じ。`type` の名前も増減なし
- **`on_connect()`** は移行前と同じく `emit_gameinfo(0)` を全員へ送る
  （送信元だけになっていない）
- **`try: ... finally: save_data()`**: 保存の回数・タイミングは移行前と
  同じ。移行前も「止められた側」はループを抜けてから `save_data()` して
  いたので、cancel 時に保存されるのも同じ。`save_data()` は同期のまま
  （`TODO.md` の「変えないもの」どおり）
- **cancel の受け止め**: `_cancel_replay()` の `except asyncio.CancelledError`
  は `await task` の分だけを受けており、握りつぶしすぎていない。
  `broadcast()` の `except Exception` も `CancelledError` を捕まえない
  （`BaseException` 側なので）ため、再生中の cancel は通る
- **`ytbg.js` の再接続**: `onerror` は再接続せず `onclose` だけが
  `setTimeout` を積む。WebSocket の `close` は 1 つの接続につき 1 回しか
  発火しないので、**二重に張られる経路も、`setTimeout` が多重に積まれる
  経路も見当たらなかった**。古い `ws` のハンドラは古いオブジェクトに
  付いたままだが、そのオブジェクトはもう発火しない。
  `emit_msg()` の `readyState !== WebSocket.OPEN` の判定も正しい
  （`CONNECTING` 中の送信も捨てる）
- **`Board` から `ws` を外したこと**: `grep` で `this.ws` の参照が
  0 件であることを確認した
- **`ws.onmessage` の各 `type`**: 字下げ以外の変更は、`console.log` の
  文言（`ws.on(json)` → `ws.onmessage`）だけ。分岐の条件も呼び出しも
  移行前と同じ
- **ログの書き方**: 変更した範囲に f-string のログは無く、`{}` の数と
  引数の数もすべて一致していた（`broadcast()` の 3 個 / 3 個、
  `on_error()` の 3 個 / 3 個、`on_connect()` / `on_disconnect()` の
  2 個 / 2 個）。`getLogger(__qualname__)` / `_log = getLogger('main')` の
  置き方も従来どおり
- **依存**: `flask` / `flask-socketio` / `gevent` が消え、
  `starlette` / `uvicorn[standard]` / `jinja2` / `pytest-asyncio` が
  足されている。過不足は無い（`jinja2` は `Jinja2Templates` に必要で、
  明示してあるのが正しい）。`uv.lock` を見た限り、
  **aarch64 の wheel は httptools・uvloop・websockets・watchfiles の
  すべてに cp314 用がある**（`manylinux2014_aarch64` / `musllinux_1_2_aarch64`。
  websockets 8 件、watchfiles 6 件）。実際に
  `uv pip list` でも uvloop 0.22.1 / websockets 17.1 などが入っている。
  mypy の overrides を `click` だけにしたのも妥当（starlette / uvicorn は
  型を持つ。`mypy src` が 0 件で通る）
- **`asyncio_mode = "auto"`**: 同期のテストもそのまま動いており、
  `no_sleep` が `asyncio.sleep(0)` を呼ぶ形にしてあるのも正しい
  （何もしない関数にすると他の Task へ制御が渡らない）
- 造語や、このリポジトリで使っていない言い回しは見つからなかった

---

## 文書の直し（main の担当。実装者は触らないよう依頼されている）

commit 前に直さないと、実態と食い違ったままになる箇所。

- `CLAUDE.md:40-53` — 「gevent の WSGI サーバで動かす」「`monkey.patch_all()`
  があるので import の順番を変えない」「`__init__.py` に `socket` / `ssl` を
  使う import を足さない」「`mylog.py` を `__init__.py` に置かない」
  「`socketio.run()` の `log_output`」。制約はすべて無くなった
  （`uvicorn.run()` の `log_level` / `access_log` に置き換わった）
- `CLAUDE.md:61-78` — テストの注意書き。`gevent.monkey.patch_all()`、
  `time.sleep` を潰す `no_sleep`、`flask_socketio.emit` と `fake_emit()`、
  `last_kwargs`（今は消えている）、`on_json(request, msg)` の説明
- `CLAUDE.md:100-110` — 「構成」の `__main__.py` の役割（C6）と、
  `index.html` が socket.io を CDN から読む記述
- `CLAUDE.md:141-145` — 履歴の節の `_repeat_flag` と `time.sleep()`
- `README.md:65` — 「flask, flask-socketio（`uv sync` が入れます）」
- `README.md:158-162` — 「A.1 Flask + Webscoket」「A.2 Javascript socket.io」
- `TODO.md:9-31`（TODO-004）— `TODO.md` 自身が「TODO-009 で移したら
  この節を書き直す」と書いている
- `ytbg.sh` / `ytbg-boot.sh` / `ytbg-stop.sh` は読んだ限り変更不要
  （実装の報告のとおり）

---

## 実測に使ったもの

スクラッチパッド
（`/tmp/claude-649/-home-ytani-work-ytBackgammon/44013cc9-501b-434a-a605-af3315f5aa9a/scratchpad/`）の
`exp1.py`〜`exp7.py`。いずれも `DATAFILE_DIR` を一時ディレクトリに
差し替え、`broadcast()` をスタブにして `ytBackgammonServer` を直接動かした
（サーバは起動していない）。
