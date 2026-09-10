# TODO-009. Flask + gevent から Starlette + uvicorn へ移す

|      | main | 担当 |
|------|------|------|
| 見込み | Opus 5 / effort high | implementer + verifier + reviewer |
| 実施 | Opus 5 / effort high | implementer + verifier + reviewer |

| 担当 | モデル | effort | output | cache_creation | 料金の割合 |
|------|--------|--------|--------|----------------|-----------|
| main | Opus 5 | high | 81,818 | 446,282 | 35% |
| implementer | Opus 5 | medium | 68,425 | 635,973 | 34% |
| reviewer | Opus 5 | high | 58,133 | 294,673 | 19% |
| verifier | Sonnet 5 | medium | 66,025 | 247,763 | 12% |
| 合計 |  |  | 274,401 | 1,624,691 | 概算 $31.3 |

- implementer は定義のモデルが sonnet。通信層の設計判断が要るので Opus 5 に
  上書きした。effort は定義の `medium` のまま（Agent ツールには渡せない）
- reviewer も定義のモデルが sonnet。挙動が変わる項目なので Opus 5 に上書きした
- verifier は定義のまま（Sonnet 5 / effort medium）
- reviewer の 2 回目は、最初の起動がセッションの上限に当たって落ちた。
  上限が戻ってから起動し直している。落ちた分の消費も上の表に含まれる
- 集計は `--since '2026-09-10 08:55:40'`（TODO-014 のコミット時刻）で切った。
  立てたのは同じ日の 03:40 だが、その後 TODO-011・012・013・014 を先に
  片付けたため

## きっかけ

gevent は `monkey.patch_all()` が前提で、import の順番と `__init__.py` に置ける
import が縛られていた（TODO-003、TODO-005）。socket.io も再接続以外の機能を
使っておらず、`index.html` が CDN から読むので外部に依存していた。

asyncio へ移せば待ちが `await` として見え、通信層も薄くなる。

利用者と相談して決めたこと。

- **Starlette + 素の WebSocket + uvicorn にする。** Tornado も候補だったが、
  ASGI の外に出るので選ばなかった
- **socket.io はやめる。** 使っているのは再接続だけ。ping は uvicorn が既定で
  20 秒ごとに送り、ブラウザが pong を自動で返す。つなぎ直せば `on_connect()` が
  `gameinfo` を丸ごと送るので、取りこぼした差分を埋める仕組みは要らない
- **プロトコルの一方向化はやらない**（TODO-010 で改めて考える）

## やったこと

### 依存（`pyproject.toml`）

- `flask` / `flask-socketio` / `gevent` を消し、`starlette` / `uvicorn[standard]` /
  `jinja2` を足した（入ったのは starlette 1.6.0、uvicorn 0.52.4）
- dev に `pytest-asyncio` を足し、`asyncio_mode = "auto"` にした
- mypy の `overrides` は `click` だけになった（starlette と uvicorn は型を持つ）
- `uvicorn[standard]` が引き込む httptools・uvloop・websockets・watchfiles は、
  いずれも aarch64 の cp314 wheel がある（`uv.lock` で確認）

### `src/ytbg/__main__.py`

- `monkey.patch_all()` を削除。**import の順番の縛りが無くなった**
- Starlette のルーティング（`/`・`/p1`・`/p2`・`/static`・WebSocket は `/ws`）と、
  **WebSocket の受信ループ**を持つ。例外の扱いは
  - `WebSocketDisconnect` → 抜ける
  - JSON として読めない → ログして**続ける**（接続は保つ）
  - 受信そのもののその他の例外 → 抜ける
  - `on_json()` の中の例外 → ログして**続ける**（接続は保つ）
- `uvicorn.run(..., log_level=('info' if debug else 'warning'), access_log=debug)`。
  `-d` なしでは uvicorn 自身のログも出ない（移行前と同じ）

### `src/ytbg/yt_backgammon_server.py`

- `emit(..., broadcast=True)` → `broadcast()`。`_client_sid`（list）は
  `_clients`（WebSocket → ログ用の名前の dict）になった。
  `asyncio.gather(..., return_exceptions=True)` で並行に送り、
  1 つ失敗しても残りへ届く
- `on_connect` / `on_disconnect` / `on_json` / `emit_gameinfo` /
  `backward_hist` / `forward_hist` を async にした
- **連続再生を Task にした。** `_repeat_flag` をやめ、`_replay_task` と
  `_replay_lock`（`asyncio.Lock`）で管理する。`time.sleep()` は
  `await asyncio.sleep()` へ
- `app_index()` は `Jinja2Templates` の `TemplateResponse` を返す
- `save_data()` は**同期のまま**（TODO-004 で判断する）

### `src/ytbg/webroot/`

- `index.html` から socket.io の CDN 読み込みを削除
- `ytbg.js` の通信部分を素の WebSocket に。`emit_msg()` は
  `readyState !== WebSocket.OPEN` なら送らずに捨てる。`ws.on("json")` は
  `onmessage` に。**分岐の中身は変えていない**
- **再接続を足した。** `onclose` から 1 秒後に試み、失敗するたびに倍
  （上限 10 秒）。`onopen` で 1 秒へ戻す
- `Board` のコンストラクタから `ws` を外した（保持するだけで未使用だった）

### `tests/`

- `on_json()` 系を `await` に。`conftest.py` は `broadcast()` を差し替える形に
  変え、`no_sleep` は `asyncio.sleep` を差し替える（**何もしない関数にはしない**。
  他の Task へ制御を渡す必要がある）
- **`tests/test_broadcast.py`（6 件）と `tests/test_replay.py`（5 件）を足した。**
  `broadcast()` の中身、接続管理、再生の cancel を見る。57 件 → 68 件

### 移行の途中で直したもの（レビューの指摘）

reviewer が挙げた「移行前と挙動が違う」3 点を、利用者の判断で直した。

- **連続再生の cancel に競合があった**（要修正）。`_cancel_replay()` が
  `await task` で待つ間に別の要求が入ると、`_replay_task` から辿れない
  再生 Task が残る。実測で逆方向の 2 本が 10 秒以上打ち消し合い、
  `gameinfo` を 203 通送った。`asyncio.Lock` で「cancel → 待つ → 作る」を
  一続きにして直した
- **n 手ぶんの `back` / `fwd`（n > 0）が同時に来ると 1 手分失われていた。**
  Task にせず、ロックを握ったままその場で走り切る形にした
- **再生 Task の中の例外が `on_error()` に届いていなかった。**
  `_replay()` で包んで拾うようにした

## 確かめたこと

- `uv sync` / `uv run pytest`（68 passed）/ `uv run ruff check .`（0 件）/
  `uv run mypy src`（0 件）。**mypy は移行前 7 件から 0 件になった**
  （グローバルの `svr = None` をやめたため）
- **テストを壊して落ちることを確かめた。** 12 通りの壊し方を試している
  （`broadcast()` を空にする、cancel をやめる、ロックを外す、など）。
  1 回目の確認では「`broadcast()` を壊しても 1 件も落ちない」状態が
  見つかり、テストを足して塞いだ
- 素の WebSocket クライアント 2 本で、接続時の `gameinfo`、`put_checker` の
  broadcast、連続再生とその最中の別メッセージ、再生の切り替え、
  不正な JSON で切れないこと
- **ブラウザ 2 タブ**（playwright）で、描画・Roll・ドラッグ・1 手戻す進める・
  連続再生・New Game・片方を閉じる。**サーバを止めて再起動すると自動で
  つながり直し、盤面が復元される**ことも確認した
- `-d` の有無でログの量が変わること。traceback は 1 件も出ない

## 残ること

- **`broadcast()` はいちばん遅いクライアントを待つ。** `gather()` で並行に
  送るようにしたが、全員へ送り終わるまで次へ進まない点は残る。1 つ詰まると
  他のクライアントの処理も連続再生の次の 1 手も止まる。消すには
  クライアントごとの送信キューが要る。**TODO-004（`save_data()` の停止時間）と
  同じ「1 か所の待ちが全体を止める」話**
- 上と重なるが、`_run_replay()` はロックを握ったまま `broadcast()` まで
  到達するので、**1 つ詰まると他のクライアントの `back` / `fwd` が
  ロック待ちになり、その受信ループも止まる**
- **n > 0 の `back` / `fwd` は、走っている間 cancel できない。** 移行前は
  共有フラグだったので止められた。`ytbg.js` は n = 1 しか送らず、待たされるのは
  1 手分だけなので、**このままにすると決めた**。止められるようにするなら、
  n > 0 も Task にして `await` して返す形にすればよい
- `_cancel_replay()` の `except asyncio.CancelledError` は、
  **「待っている相手が cancel された」のか「自分が cancel された」のかを
  区別できない**。後者だと cancel を握りつぶして先へ進む。到達するのは
  受信ループの Task が cancel される場面（サーバ停止など）に限られる
- **n > 0 の再生中は `_replay_task` が `None`**（`_run_replay()` は
  `_cancel_replay()` を通ってから、その場で走る）。「再生中か」を外から
  見分けるコードを足すときに引っかかる
- 「同じクライアントへの順序が入れ替わらない」のは、**`broadcast()` を
  順に呼んだ場合の話**。再生 Task と受信ループが同時に呼ぶ場面では
  成り立たない（スタブでは追い越しを再現できた。本物の WebSocket で
  起きるかは未確認）
- `asyncio.Lock()` を `__init__`（イベントループの外）で作れるのは
  Python 3.10 以降の性質に依る。`requires-python >= 3.14` なので今は
  問題ないが、`asyncio.Queue` などループに結びつくものを同じ場所に
  足すときは注意が要る
- `ytbg.sh` / `ytbg-boot.sh` / `ytbg-stop.sh` は**変更不要だった**
  （`ytbg-stop.sh` は `python.*/bin/[y]tbg` を見ているだけなので、
  移行後もそのまま効く）

## 分担の振り返り

`archives/agents/TODO-009/` に依頼と報告がある。

- **implementer**（Opus 5 / effort medium）は移行そのものを 1 巡で通した。
  そのうえで「例外が `on_error()` に落ちると接続が切れる」「`EmittedMessages` の
  `last_kwargs` が飾りになった」と、**自分の実装で挙動が変わった点を自分から
  報告した**。ここは分けた効果というより、報告の形（判断が要る点を必ず書かせる）
  が効いた
- **verifier**（Sonnet 5 / effort medium）は、ブラウザ 2 タブと再接続を実測し、
  **「`broadcast()` を壊しても 1 件も落ちない」というテストの穴を見つけた**。
  依頼した壊し方が「落ちるはず」の想定と違う結果になったのを、そのまま
  報告してきたのが値打ちだった。2 回目では M6 の失敗件数が implementer の
  報告と食い違うことにも気づいた
- **reviewer**（Opus 5 / effort high）は、**要修正 1 件（連続再生の cancel の
  競合）を実測付きで見つけた**。逆方向の 2 本が 10 秒以上打ち消し合い
  `gameinfo` を 203 通送る、という再現まで作っている。これは
  pytest でもブラウザでも出ず、**reviewer だけが見つけた**。2 回目では
  M6 の食い違いの原因（壊した範囲の違い）も特定した
- **見込み（implementer + verifier + reviewer）と食い違わなかった。**
  「複数のファイルにまたがり、実装・テスト・文書が同時に要る」「通信層が
  変わるのでレビューも入れる」という立てたときの見立てが、そのまま当たった
- **次に同じ規模の項目をやるなら**、reviewer を**移行の直後に 1 回**入れる
  のは変えない。ただし今回は verifier → reviewer → implementer → verifier →
  reviewer と 5 巡し、main の料金が 35% を占めた。**verifier の 1 回目と
  reviewer の 1 回目は同時に走らせられた**（reviewer はコードを読むだけで、
  verifier が壊す作業と衝突するのは pytest を走らせる瞬間だけ。reviewer 側に
  「テストは走らせず読むだけ」と指示すれば分けられる）。並行にすれば
  main の巡回が 1 回減る。3 回目の直し（テストの穴 1 件と docstring）は
  main が最終確認だけして済ませたが、この判断は妥当だった
  （src の挙動を変えない直しだったため）
