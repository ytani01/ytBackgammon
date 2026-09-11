# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

ネットワーク共有型のバックギャモンボード。Starlette + uvicorn のサーバと、
ブラウザ上の JavaScript クライアントからなる。**対戦相手を組ませるゲームサーバではなく、
「1 枚のボードを全員で共有して自由に触れる」ことを目的にしている**（観戦者も操作できる）。
ルールチェックは補助であり、free move モードで無効化できる。

## 実行

uv を使う（TODO-001 で移行した）。**リポジトリのディレクトリの中で実行する。**
`~/bin` にシンボリックリンクを張る運用はやめた（`uv run` が
`pyproject.toml` を見つけられないため）。

バージョンは `pyproject.toml` に手書きせず、git tag から hatch-vcs で取る
（TODO-014）。タグを打ったあとは `uv sync` を実行すること。
`[tool.uv] cache-keys` に git のタグとコミットを入れてあるので、それで
editable インストールが再ビルドされる。`git clone --no-tags` や
`--depth 1` のようにタグを持たない clone では、エラーにならず
`0.1.devN` という誤ったバージョンになるので、タグごと clone すること。

```bash
uv sync          # .venv を作って依存を入れる

# サーバ起動
./ytbg.sh -d -p 5001 -i images1a 1     # 引数は server_id、-i は static/ 以下の画像ディレクトリ
uv run ytbg --help                     # ytbg.sh は uv run ytbg を呼ぶだけ

./ytbg-boot.sh   # ポート 5001〜5004 で 4 サーバを同時起動
./ytbg-stop.sh   # ps + grep で kill

uv run pytest              # Python のテスト
uv run ruff check .
uv run mypy src
uv run basedpyright        # Emacs の eglot と同じ型チェック（TODO-034）

node --test tests/js/      # JS のルール層のテスト（npm は要らない）

npm install                # 最初の 1 回だけ（playwright を入れる）
node --test tests/browser/ # ブラウザでの動作確認（JS のテスト）
```

サーバは **uvicorn（ASGI）** で動かす（TODO-009）。Flask + Flask-SocketIO +
gevent から移した。socket.io はやめて素の WebSocket を使う。
`monkey.patch_all()` が無くなったので、**import の順番と `__init__.py` に置ける
import の制約は無くなった**（TODO-003、TODO-005 で書いていた縛り）。

WebSocket のパスは `/ws`。ping は uvicorn の既定（20 秒ごと）に任せる。
ブラウザが pong を自動で返すので、JS 側には何も要らない。クライアントは
切れたら 1 秒から始めて倍にしながら（上限 10 秒）つなぎ直す。つなぎ直せば
`on_connect()` が `gameinfo` を丸ごと送るので、**取りこぼした差分を埋める
仕組みは持たない**。

`-d` / `--debug` は `main()` の先頭の `loggerInit(debug)` に渡してログの水準を
DEBUG にし、`uvicorn.run()` の `log_level` と `access_log` を切り替える。
`-d` なしのときは uvicorn 自身のログ（`Uvicorn running on ...`、
`connection open`）も出ない。uvicorn のログは loguru とは別系統なので、
`-d` を付けたときの書式は揃わない。

テストは `tests/` にあり、`uv run pytest` で走る（TODO-006）。`gameinfo` の
更新、履歴、保存・読み込みに加えて、`on_json()` の `type` ごとの振る舞いを
見ている（TODO-013）。

**Python のテストは pytest、JS のテストは node で走らせる**（TODO-021）。
走らせ方は 3 つある。

| 対象 | 手段 |
|------|------|
| Python | `uv run pytest` |
| JS のルール層 | `node --test tests/js/` |
| ブラウザでの動作 | `node --test tests/browser/` |

`tests/js/` は `rules/` の純粋関数だけを見る（TODO-027）。`node --test` は
Node の標準機能なので、**npm パッケージは要らない**（playwright が要るのは
`tests/browser/` だけ）。DOM を触るクラスは単体テストせず、ブラウザの確認で見る。

ブラウザでの動作確認は `tests/browser/` にあり、`node --test tests/browser/`
で走る。サーバを実プロセスとして起動し、playwright の chromium で
ページを開いて見る。

- `board.test.mjs` — 盤面の描画・Roll・ドラッグ・2 枚目のタブへの同期・
  コンソールエラー
- `rules.test.mjs` — **`Board` がルール層につながっているか**（TODO-027）。
  `board.position()` / `pip_count()` / `winner_is()` / `closeout()` /
  `get_dst_points()` をページの中で呼ぶ。ほかの 2 つはドラッグを
  free move で行うので、ルール判定を通らない
- `clicks.test.mjs` — メニュー・ヘッダのチェックボックスと入力・盤面の
  ボタン・バナーを実際に押し、**送られたメッセージの `type` / `data` /
  `history`** と、変わった `board` の属性を見る（TODO-028）。
  `WebSocket.prototype.send` を包んで送ったものを貯め、`confirm()` は
  自動で OK する。サーバの返事を待つ目印に、プレーヤー 1 の名前を
  変えずに送り直しているので、**このファイルの中でプレーヤー 1 の名前を
  変えないこと**

注意する点:

- **ブラウザはシステムの `/usr/bin/chromium` を `executablePath` で指定して
  いる**（`tests/browser/helper.mjs`）。`~/.cache/ms-playwright/` にある
  リビジョンが playwright 1.63.0 の要求と合わないため。
  `npx playwright install` で落とし直さない
- 保存先は `YTBG_DATA_DIR` で一時ディレクトリへ逃がす。この環境変数は
  `BackgammonServer.DATAFILE_DIR` が見ており、無ければ `$HOME`。
  利用者の `~/ytbg-*` は読み書きされない
- ポートは固定せず、空いているものを OS に選ばせる。サーバは
  `detached` で起動してプロセスグループごと kill する（`uv run` の下に
  python がぶら下がるため）。`pkill` は使わない
- コンソールエラーの判定では、サーバ以外から取るもの（font awesome の
  CDN）だけを除いている。`/static/favicon.png` を置いて
  `index.html` に `<link rel="icon">` を書いたので、`/favicon.ico` の
  404 は出ない（TODO-022）
- **ここでも、通ることだけを見ない。** `src/` をわざと壊して、狙った
  テストが落ちることを確かめる（TODO-021 で 4 通り試した）

テストを足すときの注意:

- テストは `pytest-asyncio` の `asyncio_mode = "auto"` で走るので、
  `async def` のテストをそのまま書ける。`backward_hist()` /
  `forward_hist()` には `sleep_sec=0` を渡す。`on_json()` 経由では
  `sleep_sec` を渡せないので、`no_sleep` フィクスチャで `asyncio.sleep` を
  差し替える。**何もしない関数にはしない**（連続再生は Task なので、
  他の Task へ制御を渡す必要がある。本物の `asyncio.sleep(0)` を呼ぶ）
- 連続再生（`back2` / `back_all` / `fwd2` / `fwd_all`）は Task で走り、
  `on_json()` は待たずに返る。**完了を待つテストは
  `await bg_server._replayer._task`**（TODO-009、TODO-025）
- `BackgammonServer` はコンストラクタの中で `load_data()` を呼び、
  保存先を `DATAFILE_DIR`（`$HOME`）から組み立てる。`conftest.py` の
  `bg_server` フィクスチャが `DATAFILE_DIR` を `tmp_path` に差し替えている
  ので、利用者の `~/ytbg-*` は読み書きされない。**このとき履歴が
  1 件積まれる**ので、件数を数えるテストはそれを前提に書く
- 同じフィクスチャが `ClientHub.broadcast()` を丸ごと差し替え、送られた
  メッセージを `emitted`（`EmittedMessages`）へ積む。テストは**送られた
  メッセージの列**を見る（`messages` / `types` / `last`）。**この差し替えの
  せいで `broadcast()` の中身は動かない**ので、送信そのものを見るテストは
  差し替えていない `bg_server_raw` を使う（`tests/test_broadcast.py`）
- **WebSocket 経路そのもののテストは `tests/test_ws.py`**（TODO-025）。
  `create_app()` で作ったアプリに Starlette の `TestClient` で直接つなぐ
  （dev 依存の `httpx2` が要る。`httpx` はこの版の starlette が非推奨に
  していて、入れると警告が出る）。`TestClient` は同期なので、ここだけ
  `async def` ではない。**`receive_json()` には待ち時間の上限が無く、
  接続が切れる壊し方をすると永久に待つ**ので、テスト側の `recv_json()`
  が daemon のスレッドで受けて 5 秒で打ち切る
- `on_json(ws, msg)` の第 1 引数は `req` フィクスチャ（WebSocket のスタブ）。
  **`request` は pytest の予約語**なので、その名前のフィクスチャは作れない
- クロックのテスト（`tests/test_clock.py`）は `time.monotonic()` を
  差し替えて時間を進める。実時間を待たない
- **`tests/js/helper.mjs` の初期配置は `src/ytbg/gameinfo.py` の写し**
  （TODO-027）。手で写したものなので、**片方だけ変えても誰も気づかない**。
  ルール層のテストは「初期配置の PIP は 167」のようにこの値を前提に
  しているので、ずれると誤った値を正解として固定してしまう。
  初期配置を変えるときは両方を直すこと
- **テストが通ることだけを見ない。** `src/` をわざと壊して、狙ったテストが
  落ちることを確かめる（TODO-013）。最初に書いた 55 件のうち、
  `broadcast=True` を全部外しても `history_flag` を反転しても
  `SEC_CHECKER_MOVE` を変えても、1 件も落ちなかった。TODO-009 でも、
  `broadcast()` を空にしても 1 件も落ちない状態が見つかっている

`uv run ruff check .` と `uv run mypy src` の指摘は 0 件（TODO-011、TODO-009）。
`mypy src` は `tests/` を見ていない。

型チェックは basedpyright でも見る（TODO-034）。Emacs の eglot が使う
言語サーバと同じものなので、**エディタに出る指摘と `uv run basedpyright` の
出力が揃う**。水準は `pyproject.toml` の `[tool.basedpyright]` で
`standard` にしてある（既定の `recommended` は mypy よりずっと厳しく、
`reportUnknownMemberType` や `reportAny` が `src/` だけで 500 件以上出る）。
引数なしで走らせると `tests/` も見て、指摘は 0 件。

`sec` のように float を渡す引数に `int` と書くと、**mypy は通すが
basedpyright は落ちる**（mypy には int の引数へ float を渡せる特例がある）。

## 構成

**これから作る構成は [`docs/design.md`](docs/design.md) にある**（TODO-020 で
決めた）。JS の ES Modules 化、ルール層の切り出し、メッセージの型付けと
`on_json()` のディスパッチ表は、そちらが正。`gameinfo` の dataclass 化・
クロックの切り出し・保存形式は TODO-024 で、Python のモジュール分割は
TODO-025 で実装済み。以下はいまの実装。

Python は `src/ytbg/` にある（パッケージ名は `ytbg`）。`templates/` と
`static/` は `src/ytbg/webroot/` の下。

- `src/ytbg/__init__.py` — パッケージの定数。`webroot/` の絶対パス（`WEBROOT`）は
  ここにあり、`app.py` が `templates/` と `static/` の両方に使う。
  `__file__` から組み立てるので、どこから起動しても解決する
- `src/ytbg/__main__.py` — エントリポイント（`[project.scripts]` の `ytbg`）。
  click の `main()` **だけ**（TODO-025）。`create_app()` を呼んで
  `uvicorn.run()` に渡す
- `src/ytbg/app.py` — `create_app(svr_name, svr_ver, svr_id, image_dir)`。
  Starlette のルーティング（`/`, `/p1`, `/p2` はすべて同じ `index.html`、
  `/static`、WebSocket は `/ws`）と、**WebSocket の受信ループ**を持つ。
  受け取ったメッセージの処理は `BackgammonServer` に委譲するが、**例外の
  ときに接続を続けるか切るかはこのループが決めている**（TODO-009）。
  `WebSocketDisconnect` と、受信そのもののその他の例外では抜ける。
  JSON として読めないときと、`on_json()` の中で例外が起きたときは、
  ログに出して**接続を保ったまま続ける**（移行前の Flask-SocketIO も
  イベントハンドラの例外で切断はしなかった）。
  **モジュールのグローバルだった `svr` と `app` は無い**（TODO-025）。
  `BackgammonServer` は `create_app()` の中で作り、テストから触れるように
  `app.state.svr` にも入れてある。`index.html` を返すのもここ
  （`svr_name` と `image_dir` は表示のためだけの値なので、
  `BackgammonServer` は持たない）
- `src/ytbg/server.py` — `BackgammonServer`。サーバ側の中心（TODO-025）。
  クライアントから届いたメッセージの分岐（`on_json()`）と、盤面・履歴・
  クロック・保存・配信のとりまとめ。HTTP の応答は持たない
- `src/ytbg/gameinfo.py` — `GameInfo` / `BoardState` / `CubeState`（TODO-024）。
  盤面の状態そのものを表す dataclass。`put_checker()` / `cube()` /
  `dice()` / `set_turn()` / `set_playername()` / `set_score()` /
  `resign_game()` / `new_game()` という更新のメソッドもここが持つ
  （TODO-025 で `ytBackgammon` を吸収した。`resign` は dataclass の
  フィールド名なので、メソッドは `resign_game()`）。`to_dict()` は
  `dataclasses.asdict()`、`from_dict()` は自前。**ファイルから読むときだけは
  必須キーの欠落を例外にする**（黙って初期配置になると、壊れたファイルが
  「初期配置の N 手」として読まれてしまう）
- `src/ytbg/clock.py` — `Clock`（TODO-024）。クロックは `gameinfo` の外に置く
- `src/ytbg/history.py` — `History`（TODO-025）。戻す側（`_history`）と
  進む側（`_fwd_hist`）の 2 つのスタックと通し番号。**保存は持たない**
  （保存には `Storage` とクロックが要るので `BackgammonServer` の担当）
- `src/ytbg/hub.py` — `ClientHub`（TODO-025）。接続中の WebSocket と、
  全員への送信（`broadcast()`）。**`BackgammonServer` に素通しは無い**
- `src/ytbg/replay.py` — `Replayer`（TODO-025）。連続再生の Task を
  1 本だけ持つ。`start()` は Task にして投げ、`run()` はロックを
  握ったまま走り切る
- `src/ytbg/storage.py` — `Storage`（TODO-024）。
  `~/ytbg-{server_id}.jsonl` への保存・読み込みと、旧形式の変換
- `src/ytbg/webroot/static/js/` — クライアント。ES Modules で、バンドラは
  使わない（TODO-028）。クラス階層図は `ui/base.js` の先頭にある
  - `main.js` — エントリ。`build_dom()` で要素を作り、`Board` を作り、
    WebSocket をつなぐ。ヘッダとメニューの操作は、末尾でまとめて
    `addEventListener` でつなぐ（TODO-029。`window` への橋渡しはもう無い）。
    `window.board` はデバッグ用に残してある。
    **モジュールの中で素の `board` を書かないこと**（`this.board` か、
    受け取った `board` を使う）。`index.html` に `<div id="board">` が
    あり、id を持つ要素は `window` の名前付きプロパティになるので、
    `window.board` が無くても ReferenceError にならず、黙って DIV を掴む
  - `dom.js` — 盤面の要素を作る（TODO-029）。チェッカー 30 個・ダイス 8 個
    などの `<div>` と、名前の `<input>` 2 つ、`#buttons`。
    **`BgImage` は `<img>` の幅・高さを読んで大きさを決めるので、
    読み込み前に `Board` を組むと幅が 0 になって配置が崩れる。**
    これを防いでいるのは次の 2 つで、**効いているのは前者**。
    - `build_dom()` をモジュールの評価時（`load` より前）に呼ぶこと。
      そこで作った `<img>` は `load` イベントを遅らせる対象になるので、
      `window.onload` に入った時点で読み込みが済んでいる
    - `main.js` の `wait_images()`。**上の順序が保たれている限り
      常に即 resolve する**（画像の応答を 1.5 秒遅らせても、
      `window.onload` 時点で未読み込みは 0 枚だった。TODO-029 で実測）。
      `build_dom()` を `window.onload` の中へ移すと前者の保護が消えるので、
      備えとして残してある
    **どちらもテストでは守られない。** `wait_images()` を外しても
    `tests/browser/` は全件通る（no-op なので当然）。
    この順序を変えるときは、画像の応答を遅らせて配置を実測すること
  - `ws.js`（接続・再接続・送信）、`log.js`、`layout.js`（盤面の座標）、
    `settings.js`（Cookie / QueryString と、`<body>` の `data-*` から読む
    `get_image_dir()` / `get_server_id()`）、`sound.js`
  - `board.js` — `Board`
  - `rules/` — ルール層（TODO-027）。`position.js` に `Position` と
    `goal_point()` / `bar_point()` / `get_pip()`、`move.js` に
    `calc_dst_point()`、`judge.js` に `pip_count()` / `calc_gammon()` /
    `winner_is()` / `closeout()`。**DOM も `Board` も見ず、値を返すだけ**で、
    import してよいのは `rules/` の中だけ。表示の更新
    （`pip[player].set()`）と状態の書き換え（`resign = -1`）は
    `Board` の側で行う。`Board.position()` が `this.point[]` から
    `Position` を作って渡す
  - `ui/` — 表示部品。`base.js` に `BgBase` / `BgText` / `BgImage`、
    ほかは `point.js` / `checker.js` / `cube.js` / `dice.js` / `clock.js` /
    `label.js` / `button.js`。`board` と `player` は基底のコンストラクタの
    options で渡す
- `src/ytbg/webroot/templates/index.html` — ボード 1 面。
  `<script type="module" src="/static/js/main.js">` の 1 行で読み込む。
  **中身は `<header>` と空の `<div id="board">` だけ**で、盤面の要素は
  `dom.js` が作る（TODO-029）。画像ディレクトリとサーバ ID は
  `<body data-image-dir="..." data-server-id="...">` で渡す。
  **キャッシュ避けはサーバ側**で、`/static` は `Cache-Control: no-cache` で
  返す（`app.py` の `NoCacheStaticFiles`。TODO-028）。以前の `?ts=` 付き URL は、
  `import` した先のモジュールには効かないのでやめた
- `ytbg.html` — 複数サーバの画面を iframe で並べる一覧ページ（サーバ経由ではなく静的）

### サーバ 1 プロセス ＝ ボード 1 面

`server_id` ごとに別プロセスを別ポートで起動する。状態ファイルもクッキー名も
`server_id` で分かれる。複数ボードは「複数プロセス ＋ iframe」で実現している。

### 状態と通信

盤面の状態は `GameInfo`（`gameinfo.py`）。`sn`、`server_version`、`game_num`、
`match_score`、`score`、`turn`（-1 以下:操作不可、0/1:各プレーヤー、
2 以上:両方可）、`resign`、`board`（`playername` / `cube` / `dice` / `checker`）。
**クロックはここに入っていない**（TODO-024。下の「クロック」を見ること）。

チェッカーは `checker[player][i] = [point, idx]` の配列で、**ID は
`player * 100 + i`**（例: 012, 101）。サーバ側の `put_checker()` はこの ID を
100 で割ってプレーヤーを求める。

ポイント番号は 0〜25 が盤上（0 と 25 がゴール = `goal_point(player)`）、
**26, 27 がバー**（`bar_point(player) = 26 + player`）。プレーヤー 0 は番号が
減る方向、プレーヤー 1 は増える方向に進む（`calc_dst_point()`）。

メッセージは全て WebSocket（`/ws`）で送る JSON 1 本で、
`{src, type, data, history}` の形（クライアント側は `emit_msg()`）。
`history: true` を付けたメッセージだけが履歴に 1 手として積まれる。
ただし、クロック系の 7 つの type（`set_clock_limit` / `set_player_clock` /
`set_clock_switch` / `start_clock` / `resume_clock` / `stop_clock` /
`reset_clock`）は `gameinfo` を書き換えないので、`history: true` で届いても
積まない（`message.py` の `NO_HISTORY_TYPES`）。1 つ前のエントリと `sn` 以外が
同じ場合も積まない（TODO-032）。

**`type` を書くのはクライアント → サーバの向きだけ**で、分岐はサーバの
`on_json()` にしかない（TODO-015）。サーバが返すのは `gameinfo` 1 本で、
`data` に直前の操作が `last_op`（受け取った msg そのまま。操作に紐づかない
送信では `None`）として入る。クライアントは `gameinfo` で盤面を作り直し、
**音と dice の回転だけを `last_op` から出す**（`Board.apply()`）。

**表示を変えるのは `Board.apply(gameinfo, {sec, history_flag, clock_state,
last_op})` だけ**（TODO-030）。サーバから届いた `gameinfo` は
`load_gameinfo()` が名前付きの引数に直して渡すだけで、中身は持たない。

ドラッグを離した瞬間の反応（**先行実行**）も同じ経路を通る。
`Checker.on_mouse_up_xy()` は、`Board.predict_gameinfo()` で
**動かしたあとの `gameinfo` を予測して作り**、`apply()` に渡す
（共有ボードなので、サーバの応答を待つと操作感が悪い）。

- 予測は `this.gameinfo` を土台に、動かしたチェッカーの `[point, idx]`
  だけを書き換える。**`sn` は進めない。** 動かせるかは
  `Position.with_move()` が確かめる（駒が無ければ例外）
- **ヒットのときは 2 手ぶん**（相手をバーへ、自分を移動先へ）。
  サーバへ送る `put_checker` の `idx` も、この予測から取る
- **予測のときは `clock_state` と `last_op` を渡さない。**
  クロックは古い残り時間から数え直しになり、音は二重に鳴る
- **予測が外れても、サーバから届く `gameinfo` で表示は戻る**
  （`apply()` は毎回チェッカーを配り直す）。
  確認は `tests/browser/predict.test.mjs`
- `apply()` は dice を `gameinfo` の値に戻すので、**使ったダイスの
  `disable()` は `apply()` のあとで行う**。先にやると使用済みが消える。
  予測が古い値へ戻さないよう、**dice だけは `roll_btn` から写す**
- **free move のときは先行実行しない**（`emit` して return する）。
  ルール判定を通らないので、行き先を確かめられない
- **予測は、動かした駒と dice 以外を「最後に届いた `gameinfo`」へ戻す。**
  `score` / `playername` / `cube` / `turn` は `apply()` が毎回
  `gameinfo` から書き直すので、**画面の方が新しい値は 1 往復ぶん
  巻き戻る**（他のクライアントの変更が飛んでいる間だけ起きる。
  サーバの返事で必ず直る）。TODO-030 で増えた挙動だが、
  `score` の競合そのものはそれ以前からある

届いたメッセージは `message.py` の `parse()` が型を付ける（TODO-026）。
`type` ごとの frozen dataclass に組み立てるので、**`data` のキーが
足りなければ入口で `KeyError` になる**（奥の `msg['data']['n']` まで
持ち越さない）。`parse()` が返す `Message` は
`{type, data, history, raw}` で、`raw` が `last_op` に要る受け取った
msg そのもの。**`data` と `history` は全ての `type` で必須**になった。
`back` や `clear_hist` のように中身を使わない `type` でも、キーが
無ければ `parse()` で `KeyError` になる（旧 `on_json()` は読まずに
`return` していた）。

`on_json()` は 2 つの登録表で動く。`message.py` の `DATA_TYPES`
（`type` → dataclass）と、`server.py` の `self._handlers`
（`type` → ハンドラ）。**キーの集合が一致していること**を
`tests/test_message.py` が見ているので、片方だけに足すと落ちる。
**登録表に無い `type` は、警告をログに出して無視する**（履歴に積まず、
`gameinfo` も送り返さない。接続は保つ）。文字列でない `type` も
同じ扱い。

ハンドラは全て `async def` で、戻り値で共通の後処理を分ける。
`None` は「自分で送信済み」（`back` / `back2` / `back_all` / `fwd` /
`fwd2` / `fwd_all` / `clear_hist` / `new` / `set_gameinfo` の 9 つ）、
`float` は「アニメーションの秒数。`history` フラグを見て履歴へ積み、
`emit_gameinfo()`」（盤面とクロックを変える 14 個）。秒数を返すのは
`put_checker`（`SEC_CHECKER_MOVE`）だけで、残りは `0`。

`type` を足すときは、`DATA_TYPES` に dataclass を、`_handlers` に
ハンドラを足す。演出が要るときだけ `apply()` にも足す。

全員への送信（`broadcast()`）は `asyncio.gather()` で並行に送るが、
**いちばん遅いクライアントを待つ**（全員へ送り終わるまで次へ進まない）。
1 つ詰まると、他のクライアントの処理も連続再生の次の 1 手も止まる。
消すにはクライアントごとの送信キューが要る（TODO-009 ではやっていない）。

### クロック

**表示を進めるのはクライアント側だけ**だが、残り時間の基準はサーバも持つ
（TODO-016）。`on_json()` には `set_clock_limit` / `set_player_clock` に加えて
`set_clock_switch` / `start_clock` / `stop_clock` / `resume_clock` /
`reset_clock` の分岐があり、いずれも return せず、末尾の `add_history` と
`emit_gameinfo()` へ落ちる。

**クロックは `Clock`（`clock.py`）が持ち、`gameinfo` には入れない**
（TODO-024）。入れると履歴に載り、`back` / `fwd` でクロックの発着まで
巻き戻ってしまう。`Clock` が持つのは `limit`（持ち時間と猶予）、
`sw`（機能そのものの ON/OFF）、`active`（プレーヤーごとの動作中かどうか）、
`clock`（最後に止まった時点の残り時間）、基準の時刻（`time.monotonic()`）。

残り時間は `clock` の値から基準の時刻の経過分を引いて求める（`Clock.cur()`。
計算は `ui/clock.js` の `PlayerClock.update()` と同じで、持ち時間はマイナスも
許す）。動き方が変わる直前に `Clock.freeze()` でそこまでの分を `clock` へ
書き戻し、時刻を打ち直す。`emit_gameinfo()` は `Clock.state()`
（`sw` / `active` / `clock` / `limit`）を `clock_state` として添えるので、
**あとからつないだクライアントも動作中の表示に戻せる**。
**クライアントはクロック関連をすべて `clock_state` から読む**
（`gameinfo` に `clock_limit` と `board.clock` は無い）。

`sw` の初期値は `True`。`index.html` の Clock のチェックボックスが
既定で checked なので、`False` にすると、つないだ画面が `clock_state` を
受けてチェックを外してしまう。

クロックの状態はファイルの 1 行目に書かれる（下の「履歴」）。保存するのは
`limit` / `sw` / 残り時間で、**`active` は保存しない**。サーバが落ちている
間の時間は数えられないので、読み込んだときは必ず止まった状態で始める。
`set_clock_switch` だけは、`history: false` で届いても保存する
（`board.js` の `Board.apply_clock_sw()` がそう送るので、そこで保存しないと
切ったまま再起動しても `sw` が戻ってしまう）。

### 履歴（戻す・進める）

`_history` と `_fwd_hist` の 2 つのスタック（`history.py` の `History`）。
戻すと `_history` から pop して
`_fwd_hist` へ積む。gameinfo を履歴のもので置き換えるのは `_load_hist_ent()`
で、履歴のエントリをそのまま入れるだけ。**クロックは `gameinfo` の外に
あるので、戻しても動いているクロックは巻き戻らない**（TODO-024。
TODO-016 では「残り時間だけは引き継ぐ」という例外で塞いでいた）。

`History.add()` は、直前のエントリと `sn` 以外が同じなら積まないが、
**積まなかったときも `_fwd_hist` は必ず捨てる**（TODO-032）。New Game の
ように、いまの盤面がたまたま直前のエントリと同じになる操作でも、
利用者の意図は「進む側を捨てる」ことなので、盤面が変わったかどうかとは
別に扱う。

連続再生（`back2` / `back_all` / `fwd2` / `fwd_all`）は Task で走り、
`await asyncio.sleep()` を挟みながら 1 手ずつ送る。**再生中に別の再生要求が
来ると、前の Task を cancel してから始める**（TODO-009）。Task を持つのは
`replay.py` の `Replayer` で、cancel と Task の
差し替えはその中のロックでまとめて行う。**そうしないと、cancel を待つ
間に別の要求が入り込み、どこからも辿れない再生 Task が残る**（実際に起きた。
逆方向の 2 本が打ち消し合って止まらなくなる）。

n 手ぶんの `back` / `fwd`（n > 0）は Task にせず、ロックを握ったまま
その場で走り切る。Task にすると、2 人が同時に押したときに片方が cancel されて
1 手分失われる。そのかわり、走っている間は cancel できない（JS は
メニューからも盤面のボタンからも n = 1 しか送らないので、待たされるのは
1 手分だけ）。

履歴はメニューの「履歴を削除」から消せる（TODO-019）。`clear_history()` が
`_fwd_hist` を空にし、`_history` を今の `gameinfo` 1 件だけにして `sn` を 1 に
振り直す。**盤面そのものは変えない。** 消すと全員の履歴が消えて元に戻せないので、
`main.js` の `clear_hist()` が押した人の画面で `confirm()` を出す。
`on_json()` の `clear_hist` は、`back` と同じく `Replayer.run()` に渡す
（走っている連続再生を止めてから消す）。止めずに消すと、再生の Task が
差し替えたあとの `_history` を pop し続ける。**連続再生の途中で押すと、
止まった時点の盤面がそのまま残る**（`back` と同じで、キャンセルした
ところが今の盤面になる）。

New Game も `confirm()` で確認を取る。共有ボードなので、全員の盤面が
戻ってしまう。

保存は `~/ytbg-{server_id}.jsonl` に JSON Lines で書く（TODO-024）。
1 行目がメタ（形式のバージョンとクロック）、以降が履歴で、`h` が `_history`、
`f` が `_fwd_hist`。**書かれた順がスタックの順。** 1 行 1 手なので読みやすく、
`json.dumps()` を 1 行につき 1 回呼ぶだけなので、`gameinfo` にキーを足した
ときに保存側を直し忘れて落ちることが無い。日本語のプレーヤー名はそのまま
書く（`ensure_ascii=False`。そのぶん `open()` には `encoding='utf-8'` が要る）。

旧形式（`~/ytbg-{server_id}.json`）は **`.jsonl` が無いときだけ**読む。
`clock_limit` と `board.clock` は最後のエントリの値を `Clock` の初期値に
する。**書き戻しは常に `.jsonl` で、旧ファイルは消さない**（消すのは
TODO-031）。

### 画像ディレクトリ

`src/ytbg/webroot/static/` の `images0a` `images1a` `images2` `images3` が
ボードのデザイン。
起動時の `-i` で選ぶ。ファイル名（`board-base.png`, `checker0.png`, `dice01.png`,
`cube01.png` など）は共通で、デザインを足すときは同じ名前を揃える。

## 書き方の慣習

- ログは `mylog.py`（loguru）を使う（TODO-005）。クラス本体に
  `__log = getLogger(__qualname__)` を置き、`self.__log.debug(...)` で呼ぶ。
  クラスの無いモジュールは先頭に `_log = getLogger("main")` を置く。
  `loggerInit(debug)` は `main()` の先頭で 1 度だけ呼ぶ。
  `main()` 以外の入口（`tests/conftest.py` など）でも呼ぶこと。
  呼ばないと loguru の既定ハンドラが残り、DEBUG が全部 stderr に出る
- **ログのメッセージは f-string にせず、`{}` と引数で渡す**
  （`self.__log.debug('data={}', data)`）。loguru の書き方に合わせ、
  値を引数のまま残すため。**速さのためではない**（TODO-005）。
  この `mylog.py` はハンドラを `level=0` で足してフィルタで水準を見るので、
  loguru はフィルタより先に書式を組み立てる。つまり
  **水準で抑制されるログでも文字列は作られる**。f-string にしても速さは変わらない。
  代わりに、メッセージにリテラルの `{` `}` を書いたり、`{}` の数と引数の数が
  合わなかったりすると、抑制される水準でも実行時に例外になる
- コード内のコメント・docstring は日本語と英語が混在している。周りに合わせる
- クライアント側の座標は `layout.js` の `BX` / `BY` の配列を基準に
  組み立てられている（`Board` が複製して `this.bx` / `this.by` として持つ）。
  位置を直すときはこの配列を見る
