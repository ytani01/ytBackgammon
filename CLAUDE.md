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
  `ytBackgammonServer.DATAFILE_DIR` が見ており、無ければ `$HOME`。
  利用者の `~/ytbg-*.json` は読み書きされない
- ポートは固定せず、空いているものを OS に選ばせる。サーバは
  `detached` で起動してプロセスグループごと kill する（`uv run` の下に
  python がぶら下がるため）。`pkill` は使わない
- 初回ロードで `/favicon.ico` が 404 になる。favicon を用意しておらず、
  ルートも無い。コンソールエラーの判定からは除いてある
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
  `await bg_server._replay_task`**（TODO-009）
- `ytBackgammonServer` はコンストラクタの中で `load_data()` を呼び、
  保存先を `DATAFILE_DIR`（`$HOME`）から組み立てる。`conftest.py` の
  `bg_server` フィクスチャが `DATAFILE_DIR` を `tmp_path` に差し替えている
  ので、利用者の `~/ytbg-*.json` は読み書きされない。**このとき履歴が
  1 件積まれる**ので、件数を数えるテストはそれを前提に書く
- 同じフィクスチャが `broadcast()` を丸ごと差し替え、送られたメッセージを
  `emitted`（`EmittedMessages`）へ積む。テストは**送られたメッセージの列**を
  見る（`messages` / `types` / `last`）。**この差し替えのせいで
  `broadcast()` の中身は動かない**ので、送信そのものを見るテストは
  差し替えていない `bg_server_raw` を使う（`tests/test_broadcast.py`）
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
決めた）。モジュール分割、`gameinfo` の dataclass 化、保存形式、JS の
ES Modules 化、ルール層の切り出しは、そちらが正。以下はいまの実装。

Python は `src/ytbg/` にある（パッケージ名は `ytbg`）。`templates/` と
`static/` は `src/ytbg/webroot/` の下。

- `src/ytbg/__init__.py` — パッケージの定数。`webroot/` の絶対パス（`WEBROOT`）は
  ここにあり、`__main__.py` と `yt_backgammon_server.py` の両方が使う。
  `__file__` から組み立てるので、どこから起動しても解決する
- `src/ytbg/__main__.py` — エントリポイント（`[project.scripts]` の `ytbg`）。
  Starlette のルーティング（`/`, `/p1`, `/p2` はすべて同じ `index.html`、
  `/static`、WebSocket は `/ws`）と、**WebSocket の受信ループ**を持つ。
  受け取ったメッセージの処理は `svr` に委譲するが、**例外のときに接続を
  続けるか切るかはこのループが決めている**（TODO-009）。
  `WebSocketDisconnect` と、受信そのもののその他の例外では抜ける。
  JSON として読めないときと、`on_json()` の中で例外が起きたときは、
  ログに出して**接続を保ったまま続ける**（移行前の Flask-SocketIO も
  イベントハンドラの例外で切断はしなかった）。
  `svr` はグローバルで、`main()` の中で生成される
- `src/ytbg/yt_backgammon_server.py` — サーバ側の中心。クライアントから届いた
  メッセージの分岐、履歴の管理、`~/ytbg-{server_id}.json` への保存・読み込み、
  全クライアントへの broadcast
- `src/ytbg/yt_backgammon.py` — `gameinfo`（盤面の状態そのもの）を保持し、
  更新するだけのクラス。ルール判定は持たない
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

`gameinfo` が唯一の状態（`ytBackgammon.init_gameinfo()` に構造がある）。
`turn`（-1 以下:操作不可、0/1:各プレーヤー、2 以上:両方可）、`resign`、`score`、
`clock_limit`、`board`（`playername` / `clock` / `cube` / `dice` / `checker`）。

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

サーバが `gameinfo` とは別に持つのは次の 3 つ。**`gameinfo` には入れない。**
入れると履歴に載り、`back` / `fwd` でクロックの発着まで巻き戻ってしまう。

- `_clock_sw` — クロック機能そのものの ON/OFF
- `_clock_active` — プレーヤーごとの動作中かどうか
- `_clock_start` — 数え始めた時刻（`time.monotonic()`）

残り時間は `gameinfo['board']['clock']` に入っている値から
`_clock_start` の経過分を引いて求める（`_cur_clock()`。計算は `ytbg.js` の
`PlayerClock.update()` と同じで、持ち時間はマイナスも許す）。動き方が変わる
直前に `_freeze_clock()` でそこまでの分を `gameinfo` へ書き戻し、時刻を
打ち直す。`emit_gameinfo()` は `_cur_clock()` の値を `clock_state`
（`sw` / `active` / `clock`）として添えるので、**あとからつないだ
クライアントも動作中の表示に戻せる**。`gameinfo['board']['clock']` の側は
最後に止まった時点の値なので、動作中の残り時間はそちらではなく
`clock_state` を見る。

`_clock_sw` の初期値は `True`。`index.html` の Clock のチェックボックスが
既定で checked なので、`False` にすると、つないだ画面が `clock_state` を
受けてチェックを外してしまう。

### 履歴（戻す・進める）

`_history` と `_fwd_hist` の 2 つのスタック。戻すと `_history` から pop して
`_fwd_hist` へ積む。gameinfo を履歴のもので置き換えるのは `_load_hist_ent()`
で、**クロックの残り時間だけは引き継ぐ**（TODO-016。クロックは履歴の対象外
なので、戻すと動いているクロックが昔の値から数え直しになる）。

連続再生（`back2` / `back_all` / `fwd2` / `fwd_all`）は Task で走り、
`await asyncio.sleep()` を挟みながら 1 手ずつ送る。**再生中に別の再生要求が
来ると、前の Task を cancel してから始める**（TODO-009）。cancel と Task の
差し替えは `_replay_lock` の中でまとめて行う。**そうしないと、cancel を待つ
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
`on_json()` の `clear_hist` は、`back` と同じく `_run_replay()` に渡す
（走っている連続再生を止めてから消す）。止めずに消すと、再生の Task が
差し替えたあとの `_history` を pop し続ける。**連続再生の途中で押すと、
止まった時点の盤面がそのまま残る**（`back` と同じで、キャンセルした
ところが今の盤面になる）。

New Game も `confirm()` で確認を取る。共有ボードなので、全員の盤面が
戻ってしまう。

保存は `save_data()` が JSON を文字列連結で組み立てている（`json.dump` ではない）。
1 手 1 行に近い読みやすい形にするためで、`gameinfo` にキーを足したときは
`hist_ent2str()` も直さないと保存されずに落ちる。

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
