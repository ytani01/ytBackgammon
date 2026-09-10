# TODO-009 implementer 報告

Flask + Flask-SocketIO + gevent から Starlette + 素の WebSocket +
uvicorn へ移した。commit はしていない（working tree に残してある）。

## 変えたファイル

### `pyproject.toml`

- `dependencies`: `flask` / `flask-socketio` / `gevent` を消し、
  `jinja2>=3.1.6` / `starlette>=0.51.0` / `uvicorn[standard]>=0.40.0` を足した
  （入ったのは starlette 1.6.0、uvicorn 0.52.4）
- `dependency-groups.dev`: `pytest-asyncio>=1.3.0` を足した（1.4.0 が入った）
- `[tool.pytest.ini_options]`: `asyncio_mode = "auto"` を足した
- `[[tool.mypy.overrides]]`: `module` を `"click"` だけにした
  （starlette / uvicorn は型を持つので overrides は要らなかった）

### `src/ytbg/__main__.py`（全面的に書き直し）

- 先頭の `from gevent import monkey` / `monkey.patch_all()` を削除
- Flask の `app` / `SocketIO` をやめ、`Starlette(routes=[...])` を組んだ
  - `Route('/', index)` / `/p1` / `/p2` → すべて同じ `index()`（`:41-44`）
  - `WebSocketRoute('/ws', websocket_endpoint)`
  - `Mount('/static', StaticFiles(directory=WEBROOT/'static'))`
- `websocket_endpoint()`（`:47-71`）: `accept()` → `svr.on_connect()` →
  受信ループで `receive_json()` して `await svr.on_json(ws, msg)`。
  `WebSocketDisconnect` は握りつぶし、それ以外の例外は
  `svr.on_error(ws, e, msg)` へ。`finally` で必ず
  `await svr.on_disconnect(ws)`
- `uvicorn.run(app, host='0.0.0.0', port=int(port), access_log=debug)`
  （`:104-105`）。`ws_ping_interval` は指定せず既定（20 秒）のまま
- グローバルの `svr` は `svr: ytBackgammonServer` という宣言だけにした
  （`main()` の中で生成する作りは変えていない）。移行前は
  `svr = None` のせいで mypy が 7 件のエラーを出していたが、これで 0 件になる

### `src/ytbg/yt_backgammon_server.py`

- `flask` / `flask_socketio` / `time` の import を消し、`asyncio` と
  `starlette` の `Jinja2Templates` / `WebSocket` を入れた。
  モジュール直下に `WEBROOT` と `templates`（Jinja2Templates）を置いた（`:22-24`）
- `self._client_sid`（list）→ `self._clients: dict[WebSocket, str]`（`:50`）。
  値はログ用の名前。`self._client_sn` は接続ごとの連番（`:51`）
- `self._repeat_flag` → `self._replay_task: asyncio.Task | None`（`:60`）
- `broadcast(msg)` を新設（`:106-122`）。`_clients` を回して
  `send_json()` し、失敗しても残りへ送り続ける（例外は warning）。
  ruff の BLE001 が出るので `# noqa: BLE001` を付け、理由をコメントにした
- `emit_gameinfo()`（`:124`）を `async def` にし、
  `emit(..., broadcast=True)` を `await self.broadcast(...)` に置き換えた。
  送る msg の中身は変えていない
- `backward_hist()` / `forward_hist()`（`:145` / `:182`）を `async def` にし、
  `time.sleep()` → `await asyncio.sleep()`。`_repeat_flag` を見る
  while 条件と「前の再生を止める」ループを消した。ループ全体を
  `try: ... finally: self.save_data(...)` で囲み、cancel されても
  そこまでの結果が保存されるようにした（移行前も、割り込まれたときに
  ループを抜けてから save していたので、そこは同じ）
- `client_name(ws)`（`:328`）を追加。ログに出す名前を引く
- `on_connect(ws)`（`:338`）: 連番と接続元から名前を作って `_clients` に
  登録し、`await self.emit_gameinfo(0)`。**全員へ送る挙動は変えていない**
- `on_disconnect(ws)`（`:352`）: `_clients` から pop。未登録なら debug ログ
- `on_error(ws, e, msg=None)`（`:362`）: `request.event` は無くなったので、
  クライアント名・例外・受信中の msg を出す
- `_cancel_replay()` / `_start_replay(func, *args, **kwargs)` /
  `wait_replay()` を追加（`:366-400`）
- `on_json()`（`:407`）を `async def` にした。`back` / `back2` /
  `back_all` / `fwd` / `fwd2` / `fwd_all` は `await self._start_replay(...)`
  で Task を作って**待たずに return**。他の分岐の振る舞いは変えていない。
  末尾の `emit('json', msg, broadcast=True)` は `await self.broadcast(msg)`
- `app_index(request)`（`:531`）: `render_template` →
  `templates.TemplateResponse(request, 'index.html', {...})`。渡す変数は同じ。
  **引数に `request` が増えた**（コンストラクタの引数は変えていない）

### `src/ytbg/webroot/templates/index.html`

- socket.io の CDN 読み込み（`<script src="//cdnjs.cloudflare.com/...">`）を
  削除。他は触っていない

### `src/ytbg/webroot/static/ytbg.js`

- `emit_msg()`（`:85-97`）: `ws.emit("json", ...)` →
  `ws.send(JSON.stringify(...))`。`ws` が未定義か
  `readyState !== WebSocket.OPEN` なら送らずに捨て、console.log を出す
- 先頭に再接続の間隔（`WS_RETRY_SEC_MIN` = 1、`WS_RETRY_SEC_MAX` = 10、
  `ws_retry_sec`）を足した（`:68-73`）
- `Board` のコンストラクタから `ws` を外した（`:2621` 付近）。
  `this.ws` は保持しているだけで使われていなかった
- `window.onload`（`:4146-` 付近）:
  - `board` を先に作り、そのあと `ws_connect()` を呼ぶ
  - `ws_url()` を追加。`https:` なら `wss:`、それ以外は `ws:` にして
    ポートを付け、末尾を `/ws` にする
  - `ws_connect()` を追加。`new WebSocket(url)` と
    `onopen` / `onerror` / `onclose` / `onmessage` を張る。`onclose` から
    `setTimeout(ws_connect, ws_retry_sec * 1000)` でつなぎ直し、間隔を
    倍にする（上限 10 秒）。`onopen` で 1 秒へ戻す
  - `ws.on("json", fn)` → `ws.onmessage`。`JSON.parse(ev.data)` した msg を
    今までの分岐へそのまま渡す。**分岐の中身は変えていない**
    （入れ子が 1 段深くなったぶんの字下げと、ログ中の `ws.on(json)` →
    `ws.onmessage` の書き換えだけ）
- `node --check` で構文は確認した

### `tests/conftest.py`

- `EmittedMessages`: 積むものを「`emit()` の呼び出し」から
  「`broadcast()` へ渡った msg」に変えた。`messages` / `types` / `last` /
  `last_kwargs` / `clear` は残してある（docstring は実態に合わせて書き直した）
- `bg_server`: `yt_backgammon_server.emit` の差し替えをやめ、
  `ytBackgammonServer.broadcast` を `fake_broadcast` に差し替えた
- `req`: `types.SimpleNamespace` は**ハッシュ不可**で `_clients` の
  キーにできず TypeError になったので、`FakeWebSocket` という空のクラスの
  インスタンスにした（名前は `req` のまま）
- `no_sleep`: `time.sleep` の差し替えをやめ、`asyncio.sleep` を
  「本物の `asyncio.sleep(0)` を呼ぶ関数」に差し替えた（他の Task へ
  制御を渡す必要があるので、何もしない関数にはしていない）

### `tests/test_on_json.py` / `tests/test_history.py`

- テスト関数を `async def` にし、`on_json()` / `backward_hist()` /
  `forward_hist()` / `emit_gameinfo()` の呼び出しを `await` にした
- `back` / `fwd` 系を `on_json()` で呼ぶテストには、直後に
  `await bg_server.wait_replay()` を足した（連続再生が Task になり、
  `on_json()` は待たずに返るため）
- `assert emitted.last_kwargs == {'broadcast': True}` の 2 箇所は、
  「全員へ送られたこと」を見る形に置き換えた。`emitted` には
  `broadcast()`（全員へ送るメソッド）へ渡った msg しか積まれないので、
  `emitted.last == expected` と `len(emitted.messages) == 1` が
  そのまま「全員へ送られた」の確認になる。**期待値は緩めていない**

## 完了条件の結果

| 条件 | コマンド | 結果 |
|------|----------|------|
| uv sync | `uv sync` | 成功（終了コード 0）。`uv.lock` も更新された |
| テスト | `uv run pytest` | 57 passed（終了コード 0）。移行前と同じ 57 件 |
| ruff | `uv run ruff check .` | All checks passed（0 件）。**移行前も 0 件** |
| mypy | `uv run mypy src` | Success: no issues（0 件）。**移行前は 7 件** |
| 起動と HTTP | `./ytbg.sh -d -p 5099 -i images1a 99` | `/` `/p1` `/p2` `/static/ytbg.js` すべて 200。`index.html` に socket.io の記述が無く、`images1a` が埋まっていることも確認 |
| WebSocket 2 本 | `uv run python <スクラッチパッドのスクリプト>` | 下記のとおり全て通った（終了コード 0） |
| traceback | サーバのログ | 起動から終了まで traceback は無し |

素の WebSocket クライアント 2 本での実測（スクリプトは
スクラッチパッドの `wstest.py`）:

- 接続時に `gameinfo` が届く
- 2 本目が接続すると、1 本目にも `gameinfo` が飛ぶ（`on_connect` の
  broadcast の挙動を変えていないことの確認）
- A が送った `put_checker` が A・B の両方に同じ内容で届く
- `back_all` の連続再生で B に `gameinfo` が 5 通届き、**その最中に
  B が送った `dice` が処理されて両者に届く**（再生が他のメッセージを
  止めない）
- `fwd_all` の直後に `back_all` を送ると、前の再生が cancel されて
  新しい再生が最後まで走る（最終的に `hist_i` == 1）

ログの確認:

- `-d` あり: DEBUG と uvicorn のアクセスログ（`"GET / HTTP/1.1" 200 OK`）が出る
- `-d` なし: DEBUG もアクセスログも出ない（`GET` の行は 0 件）
- 切断（正常な close、予告なしの切断のどちらも）で traceback は出ない
- 不正な JSON を送ったときは `on_error()` の ERROR ログが 2 行出るだけで、
  traceback にはならない

## 決めたこと

- **sid の代わり**: 接続順の連番と接続元を組み合わせた文字列
  （例 `c3@127.0.0.1:51004`）。`ytBackgammonServer._client_sn` を
  1 つずつ増やして `_clients[ws]` に持たせ、`client_name(ws)` で引く。
  `websocket.client` が `None` のとき（テストのスタブなど）は `c3` だけ
- **uvicorn のログ**: `uvicorn.run(..., access_log=debug)` だけを渡した。
  `log_config` は既定のままなので、uvicorn のログは loguru とは別系統で、
  uvicorn 自身の書式（`INFO:     ...`）で stderr に出る。
  `-d` で増えるのは HTTP のアクセスログ。
  なお、起動時の `Uvicorn running on ...` と、WebSocket の
  `"WebSocket /ws" [accepted]` / `connection open` は `uvicorn.error`
  ロガー（INFO）なので `-d` の有無にかかわらず出る。gevent のときは
  出ていなかった行なので、うるさければ `log_level` で下げられる
- **再接続の間隔**: 1 秒から始めて `onclose` のたびに倍、上限 10 秒。
  `onopen` で 1 秒へ戻す
- **テストの差し替え方**: `ytBackgammonServer.broadcast` を丸ごと
  差し替えて `EmittedMessages` へ積む
- **足したヘルパ**: `ytBackgammonServer.wait_replay()`。連続再生の Task の
  完了を待つ（`asyncio.wait([task])` を使っているので、cancel された
  Task を待っても呼び出し側へ `CancelledError` が飛ばない）。
  内部用に `_cancel_replay()` と `_start_replay()` も足した

## 判断が要る点・気づいたこと

1. **`on_error()` に落ちるとその接続が切れる。** 移行前の
   Flask-SocketIO は `on_error_default` で例外を拾っても接続を保っていたが、
   今は受信ループが抜けるので接続が閉じる（実測で、不正な JSON を送った
   クライアントは close code 1006 で切られた）。ブラウザ側は再接続して
   `gameinfo` を受け直すので実害は無いと見ているが、**挙動の変更**なので
   報告する。依頼の書き方（`WebSocketDisconnect` と同じ位置で捕まえる）に
   従った結果でもある。ループを続ける形にもできる
2. **`EmittedMessages.kwargs` / `last_kwargs` が実質的に使われなくなった。**
   broadcast が kwargs ではなくメソッドそのものになったので、
   常に `{'broadcast': True}` を返すだけの互換用になっている。
   「クラスの形は残す」という依頼に従って残したが、テスト側からは
   参照していないので、消してよければ消せる
3. **`broadcast()` は送信に失敗したクライアントを `_clients` から
   外していない。** 外すのは受信ループの `finally`（`on_disconnect`）に
   任せている。二重管理を避けたかったため
4. **範囲外だが気づいたこと**:
   - `CLAUDE.md` の「`__init__.py` に `socket` / `ssl` を使う import を
     足さない」「import の順番を変えない」という制約は、
     `monkey.patch_all()` が無くなったので不要になった（文書は main の担当）
   - `TODO-004` の「`save_data()` が全体を止める」は asyncio でも残る。
     今回は依頼どおり同期のままにしてある
   - `ytbg.sh` / `ytbg-boot.sh` / `ytbg-stop.sh` は変更不要だった
     （`ytbg-stop.sh` は `python.*/bin/[y]tbg` を見ているだけで、
     移行後もそのまま効く）
   - 検証中、利用者が起動したままの 5001〜5004 のサーバがあった。
     これらは移行前のコードを読み込んだまま動いている（`uv sync` で
     flask 系が消えたので、**再起動するまで気づかない**）。
     ブラウザで確認する前に `./ytbg-stop.sh` → `./ytbg-boot.sh` が要る

## 追加の直し

利用者の判断を受けて 3 点を直した（commit はしていない）。

### 1. 受信中の例外で接続を切らない

`src/ytbg/__main__.py:47-84` の受信ループを、例外の種類ごとに分けた。

| 例外 | 扱い |
|------|------|
| `WebSocketDisconnect` | debug ログを出してループを抜ける（`on_error()` には渡さない） |
| `json.JSONDecodeError`（受信段階） | `on_error(ws, e)` に渡して `continue`。接続は保つ |
| 受信段階のそれ以外の例外 | `on_error(ws, e)` に渡して `break` |
| `on_json()` の中の例外 | `on_error(ws, e, msg)` に渡してループを続ける |

`receive_json()` と `on_json()` を別々の `try` で囲み、`on_disconnect()` は
今までどおり `finally` で必ず呼ぶ。`asyncio.CancelledError` は
`BaseException` 由来なので、`except Exception` には掛からない。

実測（`-d` なしで起動し、素の WebSocket クライアント 1 本で確認）:

```
1 connect: gameinfo
2 after bad json: close_code= None          <- 不正な JSON でも切れない
3 after bad json, put_checker -> put_checker {'ch': 101, 'p': 5, 'idx': 2}
4 after on_json error: close_code= None     <- data 不足の back でも切れない
5 after on_json error, dice -> dice
```

サーバのログには `JSONDecodeError` と `KeyError('n')` の ERROR が出るだけで、
traceback は無し。そのあとも `put_checker` / `dice` が普通に往復した。

### 2. `-d` なしのときは uvicorn 自身のログも抑える

`uvicorn.run(..., log_level=('info' if debug else 'warning'),
access_log=debug)`（`src/ytbg/__main__.py:118-120`）。

- **`-d` なし**: stderr は **15 行、すべて loguru の行**。
  `INFO:` で始まる uvicorn の行は 0 行で、`Uvicorn running on ...` も
  `connection open` / `connection closed` も出ない。
  中身は起動時の INFO 1 行、データファイルが無いときの WARNING 2 行、
  接続・切断・`on_json` の INFO、`on_error()` の ERROR
  （上の 1 の確認で意図的に出したもの）
- **`-d` あり**: uvicorn の行が 7 行出て、
  アクセスログ（`INFO:     127.0.0.1:54576 - "GET /p1 HTTP/1.1" 200 OK`）と
  WebSocket の `"WebSocket /ws" [accepted]` / `connection open` を含む。
  loguru の DEBUG も 13 行出た。traceback は 0 件

### 3. `EmittedMessages` の `kwargs` / `last_kwargs` を消した

`tests/conftest.py`。テスト側からの参照が無いことを
`grep -rn "kwargs" tests/ src/` で確かめてから消した（残ったのは
`_start_replay()` の `**kwargs` と `no_sleep` の `**_kwargs` だけ）。
docstring の「互換用に残してある」という説明も落とし、
「ここに積まれた msg は全員へ送られたもの」という書き方に直した。

### 直したあとの検証

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 57 passed（終了コード 0） |
| `uv run ruff check .` | All checks passed（終了コード 0） |
| `uv run mypy src` | Success: no issues found in 5 source files（終了コード 0） |
| `./ytbg.sh -p 5099 -i images1a 99` | `/p1` が 200。上の 1・2 のとおり |
| `./ytbg.sh -d -p 5099 -i images1a 99` | 上の 2 のとおり。traceback 0 件 |
