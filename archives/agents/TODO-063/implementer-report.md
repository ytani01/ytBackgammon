# TODO-063 実装の報告（implementer）

## 変えたファイル

| ファイル | 内容 |
|----------|------|
| `src/ytbg/__main__.py:32` `_run()` | uvicorn の起動を board / lobby で共通にした（中身は元の `main` のまま） |
| `src/ytbg/__main__.py:51` `main()` | click の group にした。入口 `ytbg.__main__:main` は変えていない |
| `src/ytbg/__main__.py:64` `board()` | 元の `main` の中身。引数・オプションは同じ |
| `src/ytbg/__main__.py:81` `lobby()` | `-c`（既定 `ytbg.toml`）・`-p`（既定 5000）・`-d`。`ConfigError` は `click.ClickException` にして終了コード 1 |
| `src/ytbg/lobby.py:65` `load_config()`（新規） | `[[board]]` の配列を読む。無い・表でない・必須キーが無い・型違い（`port = true` も弾く）・ポートが範囲外・知らないキー・`server_id` / `port` の重複・TOML の構文エラー・ファイルが無い、を `ConfigError` |
| `src/ytbg/lobby.py:126` `BoardProcess` | 子プロセス 1 つぶん。`start()` は `sys.executable -m ytbg board -p -i [-d] -- SERVER_ID`。`_wait()` が終了を待って終了コードをログに出す（0 と -15 は INFO、他は WARNING）。`stop()` は SIGTERM → 5 秒で SIGKILL。起動と停止は `asyncio.Lock` で順に処理 |
| `src/ytbg/lobby.py:202` `create_lobby_app()` | lifespan で全部起動・全部停止。`/`・`GET /api/boards`・`POST /api/boards/{server_id}/start`・`/stop`（知らない id は 404）・`/static`（`app.py` の `NoCacheStaticFiles` を使う） |
| `src/ytbg/webroot/templates/lobby.html`（新規） | 一覧ページ。CSS はこの中 |
| `src/ytbg/webroot/static/js/lobby.js`（新規） | 3 秒ごとに `/api/boards` を読む。選んだボードは localStorage（`ytbg_lobby_main`） |
| `ytbg.toml`（新規） | 1〜4、5001〜5004、images2 / images0a / images1a / images3 |
| `ytbg.sh:5` | usage を board / lobby の 2 行に |
| `ytbg-boot.sh`・`ytbg-stop.sh`・`ytbg.html` | `git rm`（ステージ済みの削除） |
| `README.md` の「2. 起動」 | `ytbg.sh board` と `ytbg.sh lobby` に |
| `docs/Admin.md` | 「起動する」を `board` に、「複数のボードを立てる」を lobby の説明（オプション・設定ファイル・一覧ページ）に書き換え。「止める」に SIGKILL で子が残ること。`pgrep` のパターンを `'ytbg (board|lobby)'` に（子は `python -m ytbg board` なので `bin/ytbg` に当たらない） |
| `docs/Developer.md:39` 付近 | `ytbg.html` の段落を lobby の説明と図に。モジュール表に `lobby.py`。`:115` に「一覧サーバ（`lobby.py`）」の節（面倒を見る範囲、落とし穴） |
| `docs/Player.md` の「画面を開く」 | 一覧ページの 4 行 |
| `tests/test_lobby.py`（新規） | 下記 |
| `tests/browser/lobby.test.mjs`（新規） | 下記 |
| `tests/browser/helper.mjs:52,90` | `ytbg-boot.sh` のコメントを `ytbg.toml` に、起動を `ytbg board` に |
| `tests/browser/sound.test.mjs:13` | `ytbg.html` のコメントを lobby.js に |

## 設計の目安から外れた点・自分で決めた点

- **`server_id` は TOML で文字列に限った**（`server_id = 1` はエラー）。`board` の引数が str なので。
  数値を許して文字列に直す案もある。決めてほしい
- 知らないキーもエラーにした（`imagedir` のような書き間違いを黙って無視しないため）
- `-c` に既定値 `ytbg.toml` を付けた（リポジトリのトップで `ytbg lobby` だけで動く）
- API の状態に `pid` も入れた（テストで子の PID を取るため）
- 大きく出すボードは、ボード名ではなく「大きく表示」のボタンで選ぶ。ボード名は別タブで音ありで開く
  （仕様どおり）ので、選ぶ手段を別に置いた
- 子に `server_id` を渡す前に `--` を入れた（`-` で始まる id がオプションと取られないように）
- `lobby.test.mjs` の lobby の起動は、テストファイルの中に書いた（`helper.mjs` に足すのは範囲外のため）。
  `start_server()` と似た 50 行ほどが重なっている

## 走らせたテストと結果

| コマンド | 結果 |
|----------|------|
| `uv run ruff check .` | All checks passed（終了コード 0） |
| `uv run mypy src` | no issues（0） |
| `uv run basedpyright` | 0 errors, 0 warnings（0） |
| `uv run pytest -q` | 313 passed, 1 warning（0）。warning は starlette の TestClient の DeprecationWarning で、前からある（`tests/test_lobby.py` だけ走らせると出ない） |
| `uv run pytest tests/test_lobby.py` | 21 passed |
| `node --test tests/js/` | 156 pass |
| `node --test tests/browser/lobby.test.mjs` | 3 pass |
| `node --test tests/browser/sound.test.mjs` | 4 pass（`helper.mjs` の `ytbg board` への変更の確認） |

`tests/test_lobby.py` の中身: 設定の正しいもの（`url` あり・なし）、リポジトリの `ytbg.toml`、誤り 14 通り、
ファイルが無い。実プロセスでは、API で停止すると `running` が false になり PID が消える・起動すると別の PID で動く、
lobby に SIGTERM / SIGINT を送ると子の PID が消える、ポートが塞がっているボードは停止中になり
0 以外の終了コードがログに出る（uvicorn は bind に失敗すると 3 で終わる）。

`lobby.test.mjs` の中身: iframe の `src`（`url` 無しは `http://127.0.0.1:<port>/?sound=off`、有りは設定の URL + `?sound=off`）、
ボード名のリンクが `?sound` 無しで `target=_blank`、「大きく表示」で `main` の class が移り、リロードしても残る、
停止・起動のボタンで「停止中」「動作中」に変わる。

手で試したこと: `ytbg lobby` で 2 面起動し、`curl` で API、スクリーンショットで配置（選んだ 1 面が大きく、残りが小さく）、
`ytbg --help`・`ytbg lobby --help`、壊れた設定で `Error: ...: no [[board]]` と終了コード 1、`ytbg 1` は `No such command`（終了コード 2）。
テストのあと `ytbg (lobby|board)` のプロセスが残っていないことを `ps` で確かめた。

## 壊して確かめたこと（すべて戻した。`cmp` で元と一致を確認）

| 壊し方 | 落ちたテスト |
|--------|--------------|
| lifespan の終わりで `stop()` を呼ばない | `test_lobby_stops_boards` の 2 件 |
| 重複の判定を外す | 重複の 2 件 |
| `port = true` を通す | 1 件 |
| 一度起動したら（停止後も）`start()` を無視 | `test_start_stop` |
| `running` を常に真（終了を見ない） | `test_start_stop`・`test_board_cannot_start` |
| lobby.js で `url` を無視 | iframe の src |
| `?sound=off` を付けない | iframe の src |
| 選んだボードを localStorage に保存しない | 選択の件（リロード後） |
| 「大きく表示」が効かない | 選択の件 |
| 状態の表示を常に「動作中」 | 停止・起動の件 |
| 停止のボタンが何もしない | 停止・起動の件 |

`stop()` から SIGTERM を外しても 5 秒後の SIGKILL で止まるので、テストは落ちない（止まるまでの時間は見ていない）。

## 範囲外だが気づいたこと・残る懸念

- `tests/browser/helper.mjs` の `start_server()` の `stop()` は `Promise.race` に `sleep(5000)` を使っていて、
  サーバがすぐ終わってもタイマーが残る。各テストファイルの終わりで node が最大 5 秒待っている可能性がある
  （`lobby.test.mjs` で同じ書き方をしたら 15 秒余計にかかり、`setTimeout(...).unref()` にして直った）。直していない
- 「動作中」はプロセスが生きていることしか見ない。ポートが塞がっているボードも、起動から終了までの一瞬は「動作中」（Developer.md に書いた）
- 子は lobby と同じプロセスグループなので、端末の Ctrl+C はボードにも直接届く（問題は無いが、lobby の「stop:」のログが出ないことがある）
- ボードのページは `?sound=off` でもヘッダの Sound のチェックが入って見える（前からの挙動。ボードのクライアントは変えない範囲なので触っていない）
- `CLAUDE.md` の実行の節（`./ytbg.sh -d -p ...`、`ytbg-boot.sh`、`ytbg-stop.sh`、`uv run ytbg --help`）は main の担当なので直していない。
  `./ytbg.sh board ...` と `./ytbg.sh lobby -c ytbg.toml` に書き換える必要がある
- 作業中に `git stash` / `pop` をしたため、3 ファイルの削除のステージが外れ、`git rm --cached` で付け直した。今は `D ` でステージ済み
