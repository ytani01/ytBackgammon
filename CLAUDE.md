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
ブラウザでの動作確認は `tests/browser/` にあり、`node --test tests/browser/`
で走る。サーバを実プロセスとして起動し、playwright の chromium で
ページを開いて、盤面の描画・Roll・ドラッグ・2 枚目のタブへの同期・
コンソールエラーを見る。注意する点:

- **ブラウザはシステムの `/usr/bin/chromium` を `executablePath` で指定して
  いる**（`tests/browser/helper.mjs`）。`~/.cache/ms-playwright/` にある
  リビジョンが playwright 1.63.0 の要求と合わないため。
  `npx playwright install` で落とし直さない
- 保存先は `YTBG_DATA_DIR` で一時ディレクトリへ逃がす。この環境変数は
  `BackgammonServer.DATAFILE_DIR` が見ており、無ければ `$HOME`。
  利用者の `~/ytbg-*.json` は読み書きされない
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
  ので、利用者の `~/ytbg-*.json` は読み書きされない。**このとき履歴が
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
- **テストが通ることだけを見ない。** `src/` をわざと壊して、狙ったテストが
  落ちることを確かめる（TODO-013）。最初に書いた 55 件のうち、
  `broadcast=True` を全部外しても `history_flag` を反転しても
  `SEC_CHECKER_MOVE` を変えても、1 件も落ちなかった。TODO-009 でも、
  `broadcast()` を空にしても 1 件も落ちない状態が見つかっている

`uv run ruff check .` と `uv run mypy src` の指摘は 0 件（TODO-011、TODO-009）。
`mypy src` は `tests/` を見ていない。

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
- `src/ytbg/webroot/static/ytbg.js`（4000 行超）— クライアントのほぼ全て。
  ファイル先頭のコメントにクラス階層図がある
  （`BgBase` → `BgText`/`BgImage` → 各表示要素、`Board`）
- `src/ytbg/webroot/templates/index.html` — ボード 1 面。JS/CSS はタイムスタンプ付き
  URL で動的に読み込む（キャッシュ避け）。画像パスに `{{image_dir}}` が埋め込まれる
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

**`type` を書くのはクライアント → サーバの向きだけ**で、分岐はサーバの
`on_json()` にしかない（TODO-015）。サーバが返すのは `gameinfo` 1 本で、
`data` に直前の操作が `last_op`（受け取った msg そのまま。操作に紐づかない
送信では `None`）として入る。クライアントは `gameinfo` で盤面を作り直し、
**音と dice の回転だけを `last_op` から出す**（`Board.load_gameinfo()`）。
`type` を足すときは `on_json()` に分岐を足し、演出が要るときだけ
`load_gameinfo()` にも足す。

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
計算は `ytbg.js` の `PlayerClock.update()` と同じで、持ち時間はマイナスも
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
（`ytbg.js` の `apply_clock_sw()` がそう送るので、そこで保存しないと
切ったまま再起動しても `sw` が戻ってしまう）。

### 履歴（戻す・進める）

`_history` と `_fwd_hist` の 2 つのスタック（`history.py` の `History`）。
戻すと `_history` から pop して
`_fwd_hist` へ積む。gameinfo を履歴のもので置き換えるのは `_load_hist_ent()`
で、履歴のエントリをそのまま入れるだけ。**クロックは `gameinfo` の外に
あるので、戻しても動いているクロックは巻き戻らない**（TODO-024。
TODO-016 では「残り時間だけは引き継ぐ」という例外で塞いでいた）。

連続再生（`back2` / `back_all` / `fwd2` / `fwd_all`）は Task で走り、
`await asyncio.sleep()` を挟みながら 1 手ずつ送る。**再生中に別の再生要求が
来ると、前の Task を cancel してから始める**（TODO-009）。Task を持つのは
`replay.py` の `Replayer` で、cancel と Task の
差し替えはその中のロックでまとめて行う。**そうしないと、cancel を待つ
間に別の要求が入り込み、どこからも辿れない再生 Task が残る**（実際に起きた。
逆方向の 2 本が打ち消し合って止まらなくなる）。

n 手ぶんの `back` / `fwd`（n > 0）は Task にせず、ロックを握ったまま
その場で走り切る。Task にすると、2 人が同時に押したときに片方が cancel されて
1 手分失われる。そのかわり、走っている間は cancel できない（`ytbg.js` は
n = 1 しか送らないので、待たされるのは 1 手分だけ）。

履歴はメニューの「履歴を削除」から消せる（TODO-019）。`clear_history()` が
`_fwd_hist` を空にし、`_history` を今の `gameinfo` 1 件だけにして `sn` を 1 に
振り直す。**盤面そのものは変えない。** 消すと全員の履歴が消えて元に戻せないので、
`ytbg.js` の `clear_hist()` が押した人の画面で `confirm()` を出す。
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
- クライアント側の座標は `Board` の `this.bx` / `this.by` の配列を基準に
  組み立てられている。位置を直すときはこの配列を見る
