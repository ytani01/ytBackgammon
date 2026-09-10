# TODO-009 implementer への依頼

## 目的

サーバを **Flask + Flask-SocketIO + gevent** から
**Starlette + 素の WebSocket + uvicorn** へ移す。クライアント側も
socket.io をやめて素の WebSocket にする。

`TODO.md` の「TODO-009」の節を必ず読むこと（決めたこと・変えないものが
書いてある）。プロジェクトの `CLAUDE.md` の「構成」「状態と通信」
「履歴」「書き方の慣習」も読むこと。

## 触るファイル

- `pyproject.toml`
- `src/ytbg/__main__.py`
- `src/ytbg/yt_backgammon_server.py`
- `src/ytbg/webroot/templates/index.html`
- `src/ytbg/webroot/static/ytbg.js`（通信部分だけ）
- `tests/` 一式

## 触らないファイル

- `src/ytbg/yt_backgammon.py`（盤面のロジック。`gameinfo` の形も変えない）
- `src/ytbg/mylog.py`
- `CLAUDE.md` / `README.md` / `TODO.md` — **main が書く。触らないこと**
- `ytbg.sh` / `ytbg-boot.sh` / `ytbg-stop.sh` — 変更は要らない見込み。
  必要になったら**直さずに報告**する
- 画像ディレクトリ、`ytbg.html`、`*.css`

## 変えないもの

- メッセージの形 `{src, type, data, history}` と `type` の名前
- 保存ファイルの形式（`save_data()` / `hist_ent2str()` / `load_data()`）。
  **`save_data()` は同期のまま移す**（`asyncio.to_thread()` へ逃がすかは
  TODO-004 で決める）
- `on_json()` の分岐ごとの振る舞い（どの type で何が更新され、何が送られ、
  履歴が積まれるか）。`tests/test_on_json.py` が固めているとおり
- 盤面のロジック、画像

## やること

### 1. `pyproject.toml`

- 依存から `flask` / `flask-socketio` / `gevent` を消し、
  `starlette` / `uvicorn[standard]` / `jinja2` を足す
- dev の依存に `pytest-asyncio` を足し、`[tool.pytest.ini_options]` に
  `asyncio_mode = "auto"` を書く（既存の同期テストはそのまま動く）
- mypy の `overrides` から `flask` 系と `gevent` を外す。starlette と
  uvicorn は型を持つので overrides は要らないはず。`click` は残す
- `uv sync` が通ること、`uv.lock` が更新されることを確認する

### 2. `src/ytbg/__main__.py`

- 先頭の `from gevent import monkey` / `monkey.patch_all()` を消す。
  これで import 順の縛りは無くなる
- Starlette のアプリを組む
  - `/` `/p1` `/p2` → いずれも `index.html`（今と同じ）
  - `/static` → `StaticFiles(directory=WEBROOT / 'static')`
  - `/ws` → WebSocket エンドポイント
- WebSocket エンドポイントは、受信ループで JSON を読み、
  `await svr.on_json(websocket, msg)` へ渡す。切断は
  `WebSocketDisconnect` を捕まえて `await svr.on_disconnect(websocket)`。
  それ以外の例外は `svr.on_error()` へ渡す（下記）
- `uvicorn.run(app, host='0.0.0.0', port=port, ...)` で起動する。
  ping は uvicorn の既定（`ws_ping_interval` = 20 秒）に任せ、指定しない
- `-d` / `--debug` の役割は今と同じにする。`loggerInit(debug)` に渡して
  ログの水準を DEBUG にし、**uvicorn のアクセスログを `-d` のときだけ
  出す**（今の `log_output=debug` と同じ位置づけ）。uvicorn のログ設定が
  loguru と別系統になるのは構わないが、**どう設定したかを報告に書く**
- `svr` がグローバルで `main()` の中で生成される作りは変えなくてよい

### 3. `src/ytbg/yt_backgammon_server.py`

- `flask` / `flask_socketio` の import を消す
- **接続中の WebSocket を持つ。** 今の `self._client_sid` を、WebSocket
  オブジェクトの集合（`self._clients`）に置き換える
- **broadcast のメソッドを 1 つ用意する**（例: `async def broadcast(self, msg)`）。
  `_clients` を回して `send_json(msg)` する。
  **途中で 1 つが失敗しても、残りへ送り続ける**（例外は握って warning）
- `emit(..., broadcast=True)` の呼び出し 2 箇所
  （`emit_gameinfo()` と `on_json()` の末尾）をこれに置き換える
- **`on_connect()` の挙動は変えない。** 今は `emit_gameinfo(0)` を
  `broadcast=True` で呼んでいるので、**新規接続時は全員へ gameinfo が飛ぶ**。
  送信元だけに変えないこと（挙動が変わる）
- `on_connect` / `on_disconnect` / `on_json` / `emit_gameinfo` /
  `backward_hist` / `forward_hist` を `async def` にする
- ログに出していた `request.sid` と `REMOTE_ADDR` / `REMOTE_PORT` は、
  Starlette では `websocket.client.host` / `.port` が使える。sid に当たる
  ものは無いので、**接続を見分けられる何か**（自前の連番など）を決めて
  ログに出す。何にしたかを報告に書く
- `on_error()` は Flask-SocketIO の `request.event` を見ているので、
  受け取れる情報に合わせて書き直す（例外と、あれば受信中の msg）
- **連続再生を Task にする。**
  - `self._repeat_flag` をやめ、`self._replay_task`（`asyncio.Task` か
    `None`）を持つ
  - `time.sleep()` → `await asyncio.sleep()`
  - `on_json()` の `back` / `back2` / `back_all` / `fwd` / `fwd2` /
    `fwd_all` は、**前の再生 Task があれば `cancel()` して待ってから**、
    新しい Task を作る。**作った Task は待たずに return する**
    （今も python-socketio が別 greenlet で処理していて、再生中も他の
    メッセージが処理される。同じにする）
  - `backward_hist()` / `forward_hist()` そのものは、外から `await`
    できるコルーチンのまま残す（テストが直接呼ぶ）
  - **テストから再生の完了を待てるようにする。** `self._replay_task` を
    テストが `await` できれば足りる。専用のヘルパを足すかは任せるが、
    足したなら報告に書く
  - 今の「`while self._repeat_flag: self._repeat_flag = False;
    time.sleep(.5)`」という止め方は、Task の cancel に置き換えて消す
- `app_index()` は `starlette.templating.Jinja2Templates` で
  `TemplateResponse` を返す。テンプレートに渡す変数（`name`, `version`,
  `server_id`, `image_dir`）は今と同じ。
  **`ytBackgammonServer` のコンストラクタの引数は変えない**
  （`tests/conftest.py` の `bg_server` がそのまま呼べるように）

### 4. `src/ytbg/webroot/templates/index.html`

- socket.io の CDN 読み込み（`<script src="//cdnjs.cloudflare.com/...socket.io...">`）
  を消す。他は触らない

### 5. `src/ytbg/webroot/static/ytbg.js`

通信部分だけ。盤面のロジックには触らない。

- `ws = io.connect(url)` → `new WebSocket(...)`。URL は今の組み立てを
  使い回し、`http:` → `ws:` / `https:` → `wss:` に置き換えて `/ws` を付ける
- `emit_msg()` は `ws.send(JSON.stringify({src, type, data, history}))`。
  **`ws.readyState !== WebSocket.OPEN` のときは送らずに捨て、
  console.log を出す**（切断中に例外を投げない）
- `ws.on("json", fn)` → `ws.onmessage`。`JSON.parse(ev.data)` した中身を
  今の関数へそのまま渡す。**分岐の中身は変えない**
- `ws.on("connect")` / `ws.on("disconnect")` → `onopen` / `onclose` /
  `onerror`
- **再接続を足す。** `onclose` から一定時間後につなぎ直す。
  1 秒から始めて倍にし、上限 10 秒程度。つながったら間隔を 1 秒へ戻す。
  つなぎ直せばサーバの `on_connect` が gameinfo を送るので、
  取りこぼしを埋める仕組みは要らない
- **`Board` のコンストラクタから `ws` を外す。** `this.ws` は保持している
  だけで、どこからも使われていない（`grep -n "this\.ws"` で確認済み）。
  再接続で古い参照が残るのも避けたい

### 6. `tests/`

- `tests/conftest.py`
  - `fake_emit` の差し替えをやめ、**新しい broadcast のメソッドを
    差し替えて `EmittedMessages` へ積む**。`EmittedMessages` のクラスの形
    （`messages` / `types` / `last` / `last_kwargs` / `clear`）は残し、
    テスト側の見方を変えずに済ませる。`append()` の引数の埋め方は
    実装に合わせてよい（docstring も実態に合わせて直すこと）
  - `req` フィクスチャは、WebSocket のスタブに置き換える
    （`on_json()` がログに使う属性だけあればよい）。名前は `req` のまま
    でよいが、docstring は直す
  - `no_sleep` は `asyncio.sleep` の差し替えに変える。
    **完全に何もしない関数にしないこと**。他の Task へ譲る必要があるので、
    本物の `asyncio.sleep(0)` を呼ぶ形にする
- `tests/test_on_json.py` ほか
  - `on_json()` 呼び出しを `await` にする（`asyncio_mode = "auto"` なので
    テスト関数を `async def` にすればよい）
  - `emitted.last_kwargs == {'broadcast': True}` を見ている検証は、
    **「全員へ送られたこと」を確かめる形に書き換える**。broadcast が
    kwargs ではなくメソッドそのものになるので、意味が同じになるように
  - **テストの意図は変えない。** 落ちるからといって期待値を緩めないこと。
    緩めたくなったら、直さずに報告する

## 完了条件

- `uv sync` が通る
- `uv run pytest` が全件通る
- `uv run ruff check .` の指摘が**移行前より増えていない**
  （移行前の件数を先に控えておくこと）
- `uv run mypy src` の指摘が**移行前より増えていない**（同上）
- `./ytbg.sh -d -p 5099 -i images1a 99` でサーバが起動し、
  `/` `/p1` `/p2` が 200 を返す
- **素の WebSocket クライアントを 2 本つないで**、片方が送った
  `put_checker` が両方に届くこと、接続時に gameinfo が届くこと、
  `back_all` の連続再生が動き、その最中も他方が応答することを実測する
  （`uv run --with websockets python ...` などで。使い捨てのスクリプトは
  スクラッチパッドに置く）
- 起動から終了まで、ログに traceback が出ない（クライアントの切断時も）

**ブラウザでの操作確認は verifier が行う**ので、ここでは要らない。

## 進め方

- **commit しない。** 変更は working tree に残す（main が commit する）
- 判断に迷ったら、勝手に決めずに報告へ書く。とくに
  「変えないもの」に触れそうになったときは止めて報告する
- 移行の途中で既存の設計上の問題に気づいても、**この項目では直さない**。
  報告に書く

## 報告

`archives/agents/TODO-009/implementer-report.md` に書く。含めるもの。

- 変えたファイルと、それぞれ何をしたか
- 上の完了条件それぞれの結果（コマンドと終了コード、件数）
- 決めたこと（sid の代わり、uvicorn のログ設定、再接続の間隔、
  テストの差し替え方、ヘルパを足したならその名前）
- 判断が要る点、気になった点

**返事は 5 行以内**で、「終わったか・報告ファイルのパス・判断が要る点」
だけにすること。報告の全文を返事に貼らないこと。
