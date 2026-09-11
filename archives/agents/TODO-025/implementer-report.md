# TODO-025 implementer 報告

サーバを分割する（hub / history / storage / replay / app）。
**挙動は変えていない。** 変えたのは名前と置き場所だけ。

## 変更したファイル

### 新しく作った

- `src/ytbg/hub.py` — `ClientHub`。`_clients` / `_client_sn` と
  `add()`（hub.py:32）/ `remove()`（hub.py:49）/ `name()`（hub.py:57）/
  `count()`（hub.py:65）/ `broadcast()`（hub.py:69）。
  接続の連番と名前の付け方、`asyncio.gather()` での並行送信、
  失敗を握って警告に落とすところは、旧 `ytBackgammonServer` から
  そのまま移した
- `src/ytbg/history.py` — `History`。`_history` / `_fwd_hist` / `_cur_sn` と
  `add()`（history.py:57）/ `clear()`（history.py:82）/
  `back()`（history.py:97）/ `forward()`（history.py:111）/
  `load()`（history.py:125）。**保存は持たない**（README の 4 番）
- `src/ytbg/replay.py` — `Replayer`。`_task` / `_lock` と
  `start()`（replay.py:73）/ `run()`（replay.py:86）/
  `_cancel()`（replay.py:39）。
  **cancel と Task の差し替えは、どちらもロックの中でまとめて行う**
  （replay.py:82、replay.py:100）。Task の中の例外はコールバック
  （`_on_error`）へ渡す
- `src/ytbg/server.py` — `BackgammonServer`（旧 `ytBackgammonServer`）。
  `self._bg._gameinfo` は `self._gameinfo` になり、
  `broadcast()` の素通しは無くなった（`emit_gameinfo()` が
  `self._hub.broadcast()` を呼ぶ。server.py:134）。
  `app_index()` は app.py へ移したので無い
- `src/ytbg/app.py` — `create_app(svr_name, svr_ver, svr_id, image_dir)`。
  ルーティング、`index.html` の応答、WebSocket の受信ループ。
  **モジュールのグローバルだった `svr` と `app` は無い。**
  作った `BackgammonServer` は `app.state.svr`（app.py:114）にも入れた
- `tests/test_ws.py` — WebSocket 経路のテスト 5 件（README の 7 番）

### 消した

- `src/ytbg/yt_backgammon.py`（`ytBackgammon` → `GameInfo` に吸収）
- `src/ytbg/yt_backgammon_server.py`（`ytBackgammonServer` →
  `BackgammonServer`）

どちらも `git mv` ではなく、中身を移してから `git rm` した。

### 直した

- `src/ytbg/gameinfo.py:139-230` — `GameInfo` に更新のメソッドを足した
  （`new_game()` / `put_checker()` / `cube()` / `dice()` / `set_turn()` /
  `set_playername()` / `set_score()` / `resign_game()`）。
  クラス本体に `__log = getLogger(__qualname__)`（gameinfo.py:124。
  注釈が無いので dataclass のフィールドにはならない）
- `src/ytbg/__main__.py` — click の `main()` だけになった（60 行）
- `src/ytbg/__init__.py:13-14` — `WEBROOT` を使う側の説明を app.py に直した
- `pyproject.toml:26-30` — dev 依存に `httpx2` を足した（下の「判断が要る点」）
- `tests/conftest.py` — `bg` は `GameInfo`、`bg_server` は
  `BackgammonServer(svr_ver=..., svr_id=...)`。差し替えるのは
  `ClientHub.broadcast`
- `tests/test_*.py` — 参照の付け替え
  （`bg_server._bg._gameinfo` → `bg_server._gameinfo`、
  `_history` → `_hist.entries`、`_fwd_hist` → `_hist.fwd_entries`、
  `_clients` → `_hub._clients`、`_replay_task` → `_replayer._task`）
- `tests/test_yt_backgammon.py` → `tests/test_gameinfo_ops.py`（`git mv`）
- `CLAUDE.md` — 「構成」の節をファイル構成ごと書き直し、
  「テストを足すときの注意」「履歴」「クロック」の節のうち、
  クラス名・ファイル名が変わったところを直した

## 挙動を変えていないことの根拠（移すときに気をつけた点）

- `new_game()` の `server_version` — 旧 `ytBackgammon.new_game()` は
  `self.svr_ver`（サーバ起動時の版）を入れ直していた。`GameInfo` は
  それを知らないので、`new_game(server_version)` の引数にし、
  `BackgammonServer.new_game()` が `self._svr_ver` を渡す（server.py:80）
- `add_history()` — 旧実装は「`gameinfo` が `None` でないときだけ積んで
  保存する」。`History.add()` が積んだかどうかを返し、
  `BackgammonServer` はそれを見て `save_data()` を呼ぶ（server.py:91）
- `backward_hist()` / `forward_hist()` のループ条件
  （`len(_history) > 1` / `len(_fwd_hist) > 0`）は `History.back()` /
  `History.forward()` が `None` を返す条件として、そのまま移した
- `Replayer` へ渡す `on_error` は、束縛したメソッドではなく
  `lambda e: self.on_error(None, e)`（server.py:60）。テストが
  `monkeypatch.setattr(bg_server, 'on_error', ...)` で差し替えるので、
  呼ぶときに引き直す必要がある

## 検証

いずれも終了コード 0。

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 152 passed（元の 147 + `test_ws.py` の 5） |
| `uv run ruff check .` | All checks passed! |
| `uv run mypy src` | Success: no issues found in 11 source files |
| `node --test tests/browser/` | 5 pass / 0 fail |

警告は `starlette/testclient.py:53` の
`DeprecationWarning: The anyio.abc.BlockingPortal alias is deprecated`
の 1 件だけ。starlette の中で出るもので、こちらのコードでは消せない
（`starlette.testclient` を import した時点で出る）。

## わざと壊して確かめたこと（6 通り）

いずれも `src/` だけを壊し、確かめたあとに戻した（戻したあと
`diff -r` で元と同一であることを確認済み）。

| # | 壊した場所 | 落ちたテスト |
|---|-----------|-------------|
| 1 | `app.py` の `on_json()` を囲む `except Exception` を消す | `test_ws.py::test_error_in_on_json_keeps_connection`（`KeyError: 'ch'`）。1 件だけ |
| 2 | `app.py` の `json.JSONDecodeError` の分岐を消す | `test_ws.py::test_broken_json_keeps_connection`。1 件だけ |
| 3 | `server.py` の `on_connect()` から `emit_gameinfo(0)` を消す | `test_ws.py` の 5 件すべて（つないだ直後の 1 通が届かない） |
| 4 | `hub.py` の `remove()` を `pop` ではなく `get` にする | `test_broadcast.py::test_on_disconnect_removes_client`、`test_ws.py::test_disconnect_removes_client`（`assert 2 == 1`） |
| 5 | `history.py` の `back()` の境界を `<= 1` から `< 1` にする | 8 件（`test_history.py::test_backward_hist_all`、`test_on_json.py` の back/fwd 系） |
| 6 | `replay.py` の `start()` で `_cancel()` をロックの外に出す | `test_replay.py::test_only_one_replay_runs`。**TODO-009 の「どこからも辿れない再生 Task が残る」性質が、いまも守られている** |

1〜3 が新しく足した WebSocket 経路のテストを狙ったもの
（README の「うち 2 つは新しい経路」を満たす）。

### ハングしないようにした

3 の壊し方をすると、`TestClient` の `receive_json()` が**永久に待つ**
（待ち時間の上限が無い）。最初はこれで pytest がハングし、`timeout`
コマンドでしか止められなかった。`tests/test_ws.py` の
`recv_json()`（test_ws.py:47）が daemon のスレッドで受け、5 秒で
`pytest.fail()` にする形にしてある。`ThreadPoolExecutor` は
**待たせたままのスレッドを終了時に待つのでハングする**（実測）。
使わずに `threading.Thread(daemon=True)` にした。

## 判断が要る点

1. **dev 依存は `httpx` ではなく `httpx2` にした。** README の 7 番は
   「dev 依存に `httpx` を足す」だが、いま入っている starlette
   （0.51 系）は `httpx` を非推奨にしていて、入れると
   `StarletteDeprecationWarning: Using httpx with starlette.testclient is
   deprecated; install httpx2 instead` が毎回出る。「新しい警告を
   増やさない」を優先して `httpx2` にした。`httpx2` だけで
   `TestClient` は動く（`httpx` は入れていない）。
   **戻すべきなら指示をください。**
2. **`GameInfo` のメソッド名 `resign_game()`。** `resign` は dataclass の
   フィールド名なので、同名のメソッドは置けない。他の案は
   `set_resign()`。`on_json()` の `type` は `resign` のままで、
   外から見える名前は変わっていない。

## 範囲外だが気づいたこと（直していない）

- **`BackgammonServer._svr_id` は `_datafile_path` を組み立てる以外に
  使われていない。** `_datafile_path` だけ受け取る形にもできるが、
  `DATAFILE_DIR` の差し替えテスト（`test_datafile_dir.py`）が
  「サーバがパスを組み立てる」ことを見ているので、そのままにした
- **`History` の `_cur_sn` は、`load()` のあと更新されない。**
  旧 `load_data()` も同じで、次の `add()` が `_history[-1].sn + 1` から
  数え直すので実害は無い。`_cur_sn` は「最後に振った番号」ではなく
  「最後に `add()`/`clear()` で振った番号」になっている
- **`on_json()` の分岐はそのまま移しただけ**（20 個の `if`）。
  ディスパッチ表は TODO-026 の範囲
- `tests/test_ws.py` の `test_disconnect_removes_client` は、
  切断の反映を待つために「もう 1 本つないで数える」形にしてある。
  `TestClient` に「切断が処理し終わるのを待つ」手立てが無いため
