# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

ネットワーク共有型のバックギャモンボード。Starlette + uvicorn のサーバと、
ブラウザ上の JavaScript クライアントからなる。**対戦相手を組ませるゲームサーバではなく、
「1 枚のボードを全員で共有して自由に触れる」ことを目的にしている**（観戦者も操作できる）。
ルールチェックは補助であり、free move モードで無効化できる。

**構成・状態の持ち方・通信と、コードからは見えない落とし穴（順番の縛り、
テストでは守られない点など）は [`docs/Developer.md`](docs/Developer.md) に
ある。実装やレビューの前に読むこと。** このファイルには Claude Code 向けの
注意（実行・テスト・書き方の慣習）だけを置く（TODO-057）。

Developer.md は利用者向けなので、**TODO の番号を書かない。** 経緯を辿るときは
`archives/todo/` を grep する。

## 実行

uv を使う（TODO-001 で移行した）。**開発ではリポジトリのディレクトリの中で
`uv run` を使う。** 利用者向けのインストールは `uv tool install .` で、`ytbg` を
そのまま実行する（TODO-065。`ytbg.sh` は削除した）。インストールした `ytbg` は
その時点のコピーなので、手元の変更は `uv tool install --reinstall .` まで反映されない。

バージョンは `pyproject.toml` に手書きせず、git tag から hatch-vcs で取る
（TODO-014）。タグを打ったあとは `uv sync` を実行すること。タグの無い
clone で起きることは `docs/Admin.md` にある。

```bash
uv sync          # .venv を作って依存を入れる

# サーバ起動
uv run ytbg board -d -p 5001 -i images1a 1   # ボード 1 面。引数は server_id、-i は static/ 以下の画像ディレクトリ
uv run ytbg --help

uv run ytbg lobby -c ytbg.toml   # 設定のボードを子プロセスで全部起動し、一覧ページを出す（TODO-063）
                                 # Ctrl+C か kill で lobby を止めると、ボードも止まる

uv run pytest              # Python のテスト
uv run ruff check .
uv run mypy src
uv run basedpyright        # Emacs の eglot と同じ型チェック（TODO-034）

node --test tests/js/      # JS のルール層のテスト（npm は要らない）

npm install                # 最初の 1 回だけ（playwright を入れる）
node --test tests/browser/ # ブラウザでの動作確認（JS のテスト）
npm run test:browser         # node --test tests/browser/ と同じ
npm run test:browser:headed  # 画面を表示して 1 ファイルずつ走らせる（TODO-062）
YTBG_TEST_HEADED=1 YTBG_TEST_SLOWMO=300 node --test tests/browser/drag.test.mjs
```

## テスト

テストは `tests/` にあり、`uv run pytest` で走る（TODO-006）。`gameinfo` の
更新、履歴、保存・読み込みに加えて、`on_json()` の `type` ごとの振る舞いを
見ている（TODO-013）。

**Python のテストは pytest、JS のテストは node で走らせる**（TODO-021）。
走らせ方は 3 つある。

| 対象 | 手段 |
|------|------|
| Python | `uv run pytest` |
| JS のルール層と Controller | `node --test tests/js/` |
| ブラウザでの動作 | `node --test tests/browser/` |

`tests/js/` は `rules/` の純粋関数（TODO-027）と、偽の View を渡した
`BoardController`（`controller.test.mjs`。TODO-060）を見る。`node --test` は
Node の標準機能なので、**npm パッケージは要らない**（playwright が要るのは
`tests/browser/` だけ）。DOM を触るクラスは単体テストせず、ブラウザの確認で見る。

ブラウザでの動作確認は `tests/browser/` にあり、`node --test tests/browser/`
で走る。サーバを実プロセスとして起動し、playwright の chromium で
ページを開いて見る。

- `board.test.mjs` — 盤面の描画・Roll・ドラッグ・2 枚目のタブへの同期・
  コンソールエラー。URL のプレフィクス付きで起動したボードが開き、読み込みが
  プレフィクスの下へ行くか（TODO-064。`start_server()` の `prefix`）
- `rules.test.mjs` — ページの中の `gameinfo` とルール層の結果が合っているか
  （TODO-027）。helper の `judge()` / `pip_count()` / `dst_points()` が、ページの中で
  `rules/` を import して Controller の `gameinfo` で呼ぶ。`BoardView` がルールを
  呼ぶ経路は、PIP の表示と、パス・勝ちのバナー（`shown_banners()`）を画面から読んで見る（TODO-060）。`board.test.mjs` と
  `drag.test.mjs` はチェッカーのドラッグを free move で行うので、ルール判定を
  通らない（ルール判定を通るドラッグは `predict.test.mjs`）
- `clicks.test.mjs` — メニュー・ヘッダのチェックボックスと入力・盤面の
  ボタン・バナー・キューブ・クロックを実際に押し、**送られたメッセージの
  `type` / `data`** と、変わった盤面や設定を見る（TODO-028）。
  盤面を変える操作では、**送ったのがその 1 通だけか**と、`history` が
  付いていないことも見る（TODO-051）。得点の ▲ と free move のダイスは、
  返事の前に 2 回押して 2 回ぶん効くかを見る（TODO-052）。キューブのダブル・リダブル・テイク、
  使えるダイスが無いときにダイスを押す `end_turn` もここで見る。
  `WebSocket.prototype.send` を包んで送ったものを貯め、`confirm()` は
  自動で OK する。サーバの返事を待つ目印に、プレーヤー 1 の名前を
  変えずに送り直しているので、**このファイルの中でプレーヤー 1 の名前を
  変えないこと**
- `sound.test.mjs` — `?sound` のクエリで音が止まるか（TODO-039）。
  ページを開いて `sound.js` の `GlobalSoundSwitch` を読む。
  **`?sound=`（`=` はあるが値が空）は「値が無い」扱い**で、鳴る側になる
  （`URLSearchParams` が `?sound` と区別できないため。手書きの
  パーサだった頃は鳴らない側だった）
- `debug.test.mjs` — `?debug` のクエリで `log()` の出力が切り替わるか
  （TODO-048）。**既定では `console.log` を 1 件も出さない。**
  `open_board()` が貯めるのは console の `error` だけなので、
  このファイルは `log` を数える形で自分でページを開く
- `predict.test.mjs` — ドラッグを離した瞬間の先行実行（TODO-030）。
  予測で表示が変わり、外れてもサーバから届く `gameinfo` で戻るか。
  `move` 1 通の中身（使ったダイスと使えなくなったダイスの 11〜16、
  勝ちの点数）と、予測に失敗したら何も送らないこと（TODO-051）
- `last_op.test.mjs` — 音とダイスの回転を `last_op` から決めているか
  （TODO-051）。`controller.receive()` に `last_op` を渡し、鳴らした音と回したダイスを数える。
  振ったダイスが傾くのは振った直後だけか（TODO-060）
- `opening.test.mjs` — オープニングロールで先手が決まるか（TODO-041）
- `player_cookie.test.mjs` — cookie から読んだプレーヤー番号が数になって
  いるか（TODO-050）。文字列のままだと、サーバが型の合わない値として弾く
- `drag.test.mjs` — 駒を掴んでいる間に `gameinfo` が届いても、掴んでいる駒が
  手元の座標に残るか（TODO-053）。別のタブから `set_playername` を送って届かせる。
  キューブとチェッカーを同時に掴んでも、キューブを離せば take を送るか。
  掴んでいるキューブも、受信で手元の座標と z に残るか（TODO-060。
  **ファイル全体で走らせる**。前のテストが作るキューブの状態を使う）
- `clock.test.mjs` — Clock のチェックボックスは返事が届くまで計算も表示も
  変えないか、履歴の返事でも `clock_state` を全部反映するか（TODO-060）
- `lobby.test.mjs` — lobby の一覧ページ（TODO-063）。lobby を実プロセスで起動し、
  iframe の URL、大きく出すボードの切り替え（大きいボードだけ `?sound=off` を
  付けず、切り替えたら 2 面を読み込み直すか。TODO-072）、起動・停止のボタンで状態の表示が
  変わるか、大きいボードがウィンドウの幅と高さに収まる最大の大きさになるか
  （TODO-071）を見る。設定に `url` は無く、`prefix` のあるボードの iframe の `src` は
  一覧ページと同じオリジンの `prefix` のパス（lobby が受けたらボード自身の
  ポートへ 302 でリダイレクトする）、`prefix` の無いボードは開いたホスト名と
  ボードのポート（TODO-069）。`src`（リダイレクト前）と `frame.url()`（リダイレクト後、
  最終的にボードが開いた URL）は別物として確かめる。lobby の子プロセスそのもの
  （lobby を止めたらボードも止まるか）は `tests/test_lobby.py` が見る
- `settings.test.mjs` — 音の ON/OFF を cookie に保存して開き直しても残るか、
  PIP の最初の表示が Pip のチェックボックスに合うか（TODO-053）。
  チェックが入った状態は `addInitScript()` の `DOMContentLoaded` で作る
  （`page.route()` で `index.html` を書き換えると `/ws` への接続が弾かれる）

**テスト専用の type は無い**（TODO-051）。盤面の用意は残っている type で
行う。`helper.mjs` の `send_msg()` がページの中で `ws.js` の `emit_msg()` を
呼び、`set_turn()` が turn を変える（0 / 1 は `opening`、2 は
`opening`（`winner: -1`）、-1 は `moves` が空で `score` が 1 の `move`、
0 と 1 の間は `end_turn`）。目は `dice`、駒は `put_checker`。
**0 / 1 / -1 から 2 へは戻せず、-1 からはどこへも戻せない**（`opening` は
`turn` が 2 以上のときしか受け付けない）ので、そのときは `new` で盤面ごと戻す。
状態は helper の `gameinfo()` で読む。**テスト本体はページの中の `board` を
直接触らず、helper の関数を通す**（TODO-058。構成を変えるときに helper の中だけを
直せば済むようにするため）。**画面に出ているダイスの目**は
`shown_dice()` が要素（z・画像のファイル名・opacity）から読む
（ダイスは目を持たないため。TODO-052）

注意する点:

- **ブラウザはシステムの `/usr/bin/chromium` を `executablePath` で指定して
  いる**（`tests/browser/helper.mjs`）。`~/.cache/ms-playwright/` にある
  リビジョンが playwright 1.63.0 の要求と合わないため。
  `npx playwright install` で落とし直さない
- 既定はヘッドレス。`YTBG_TEST_HEADED`（空でも `0` でもない値）で画面を表示し、
  `YTBG_TEST_SLOWMO`（ミリ秒）で playwright の操作ごとに待ちを入れる（TODO-062）。
  画面を表示するには X（`DISPLAY`）が要る。待ちが入るのはマウス・キーボード・
  `goto` などで、`page.evaluate()` には入らない。マウスを離したあとの待ちの間に
  サーバの返事が届くので、先行実行の表示を読むテストが返事の表示を読むことになる。
  **待ちを入れた実行は、通るかどうかの確認には使わない**
- 保存先は `YTBG_DATA_DIR` で一時ディレクトリへ逃がす。この環境変数は
  `BackgammonServer` を作るときに読み（TODO-055）、無ければ `$HOME`。
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
- **テストを走らせるのは 1 回。** Python・JS・ブラウザのどれでも同じ。
  続けて何回も走らせるのは、壊した版で狙ったテストが確実に落ちるかを
  見るとき（10 回）だけ。**3 回連続にはしない**（揺れを捕まえるには足りず、
  時間だけかかる）。「タイミングで落ちるかもしれない」と思っただけでは
  回数を増やさず、テストの読み方を直して、落ちる余地そのものを無くす。
  報告に「N 回連続では走らせていない」を懸念として書かない。
  書くのは、実際に落ちた回の出力があるときだけ（TODO-063）

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
  保存先を環境変数 `YTBG_DATA_DIR`（無ければ `$HOME`）から組み立てる。
  `conftest.py` の `bg_server` フィクスチャが `YTBG_DATA_DIR` を `tmp_path` に
  差し替えている
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

## 型チェックと lint

`uv run ruff check .` と `uv run mypy src` の指摘は 0 件（TODO-011、TODO-009）。
`mypy src` は `tests/` を見ていない。

型チェックは basedpyright でも見る（TODO-034）。Emacs の eglot が使う
言語サーバと同じものなので、**エディタに出る指摘と `uv run basedpyright` の
出力が揃う**。水準は `pyproject.toml` の `[tool.basedpyright]` で
`standard` にしてある（既定の `recommended` は mypy よりずっと厳しく、
`reportUnknownMemberType` や `reportAny` が `src/` だけで 500 件以上出る）。
引数なしで走らせると `tests/` も見て、指摘は 0 件。

`float` と `int` の扱いで mypy と basedpyright の結果が食い違う点は
`docs/Developer.md` の「型チェックと lint」にある。

## 構成

説明は `docs/Developer.md` にある。

**TODO-020 で決めた構成は、TODO-023〜030 ですべて実装した。**
当時の設計そのものは `archives/docs/design.md` に移してある（TODO-033）。
TODO-049 で決めた構成の見直し（第 3 弾）の設計は `archives/docs/design-3.md` にあり、
TODO-050〜055 で実装した（TODO-055 で移した）。
TODO-056 で決めた構成の見直し（第 4 弾）の設計は `archives/docs/design-4.md` にあり、
TODO-057〜060 で実装した（TODO-060 で移した）。
**どれも現行仕様ではないので、実装の根拠として引かないこと。**

## 書き方の慣習

- ログは `mylog.py`（loguru）を使う（TODO-005）。クラス本体に
  `__log = getLogger(__qualname__)` を置き、`self.__log.debug(...)` で呼ぶ。
  クラスの無いモジュールは先頭に `_log = getLogger("main")` を置く。
  `loggerInit(debug)` は `main()` 以外の入口（`tests/conftest.py` など）でも
  呼ぶこと
- **ログのメッセージは f-string にせず、`{}` と引数で渡す**
  （`self.__log.debug('data={}', data)`）。引数を渡したうえでリテラルの
  `{` `}` を書くと、抑制される水準でも例外になる（理由は Developer.md）
- コード内のコメント・docstring は日本語と英語が混在している。周りに合わせる
- クライアント側の座標は `layout.js` の `BX` / `BY` の配列を基準に
  組み立てられている（`BoardView` が複製して `this.bx` / `this.by` として持つ）。
  位置を直すときはこの配列を見る
- **デザインの元ファイル（`static/images*/` の `*.xcf`、`images1a/ytbg.pptx` など）は
  ソースの一部としてコミットする。** 画面から参照されていなくても、不要なファイルとして
  消さない。配布物からは `pyproject.toml` の `exclude` で外している
