# TODO-025 の分担

サーバを分割する（hub / history / storage / replay / app）項目。

## なぜこの分担にしたか

- **implementer**（Opus 5 に上書き）— 複数のファイルにまたがる責務の
  移し替え。定義の sonnet では荷が重い
- **verifier**（定義のまま Sonnet 5）— 4 つの検証と、`src/` を壊して
  落ちること。新しく足す WebSocket 経路のテストが、実際にその経路を
  見ているか
- **reviewer**（Opus 5 に上書き）— 責務の移し替えで取りこぼしが出やすい。
  特に `_replay_lock` の扱い（TODO-009 で、どこからも辿れない再生 Task が
  残る問題が起きている）

## main が決めたこと（実装の前提）

`docs/design.md` の「モジュール構成」に加えて、着手時に main が決めた分。
**迷ったらここに従う。**

### 1. 最終的なファイル構成

```
src/ytbg/
  __init__.py    パッケージ定数（WEBROOT, __version__）
  __main__.py    click の main() だけ
  app.py         create_app() — ルーティングと WebSocket の受信ループ
  mylog.py       ログ（loguru）
  gameinfo.py    GameInfo / BoardState / CubeState
  clock.py       Clock
  history.py     History
  storage.py     Storage
  hub.py         ClientHub
  replay.py      Replayer
  server.py      BackgammonServer
```

**`yt_backgammon.py` と `yt_backgammon_server.py` は消える。**

### 2. `ytBackgammon` を `GameInfo` に吸収する

`put_checker()` / `cube()` / `dice()` / `set_turn()` / `set_playername()` /
`set_score()` / `resign()` / `new_game()` を `GameInfo` のメソッドにする。
`ytBackgammon.player`（どこからも使われていない）と `init_gameinfo()` は消す
（初期状態は dataclass の既定値と `new_game()` で作る）。
`BackgammonServer` からは `self._bg._gameinfo` ではなく
`self._gameinfo` で触る。

### 3. `ClientHub`

`_clients`（`dict[WebSocket, str]`）と連番を持ち、`add()` / `remove()` /
`name()` / `count()` / `broadcast()` を持つ。

**`BackgammonServer` に `broadcast()` の素通しを残さない。**
`emit_gameinfo()` が `self._hub.broadcast()` を呼ぶ。
`tests/conftest.py` は `ClientHub.broadcast` を差し替える形に直す
（`tests/test_broadcast.py` は `ClientHub` を直接見る）。

### 4. `History`

`_history` / `_fwd_hist` / `_cur_sn` を持つ。**保存は持たない**
（`Storage` と `Clock` が要るので、保存するのは `BackgammonServer`）。
`backward_hist()` / `forward_hist()` も `BackgammonServer` に残す
（1 手ごとに `emit_gameinfo()` を呼ぶので、履歴だけでは閉じない）。

### 5. `Replayer`

`_task` と `_lock` を持ち、`start()`（Task にして投げる）/
`run()`（ロックを握ったまま走り切る）/ `cancel()` を持つ。
**cancel と Task の差し替えを必ずロックの中でまとめて行う**という
TODO-009 の性質を崩さないこと。Task の中で起きた例外の行き先
（`on_error()`）は、コールバックで受け取る形にする。

### 6. `create_app()`

```python
def create_app(svr_name, svr_ver, svr_id, image_dir) -> Starlette:
```

`BackgammonServer` をこの中で作り、ルートはそれを閉じ込めた関数にする。
**モジュールのグローバルだった `svr` と `app` は無くす。**
テストから触れるように `app.state.svr` に入れておく。

`/`, `/p1`, `/p2` の index と `Jinja2Templates` は `app.py` が持つ
（`svr_name` / `image_dir` は表示のためだけの値なので、
`BackgammonServer` は持たなくてよい）。`__main__.py` は click の
`main()` だけになり、`uvicorn.run(create_app(...), ...)` を呼ぶ。

### 7. WebSocket 経路のテスト

Starlette の `TestClient` で書く（`tests/test_ws.py`）。
dev 依存に `httpx` を足す。`TestClient` は同期なので、
`async def` ではないテストになる。見るのは:

- つないだ直後に `gameinfo` が 1 通届くこと
- 操作を送ると全員へ `gameinfo` が返ること（2 本つないで確かめる）
- **JSON として読めないものを送っても接続が切れないこと**
- **`on_json()` の中で例外が起きても接続が切れないこと**
- 切断したあと `_clients` から消えること

### 8. 挙動は変えない

**この項目で変わってよいのは名前と置き場所だけ。** 変えたほうがよいと
思ったところは、直さずに報告へ書く。

## 報告

- [implementer-report.md](implementer-report.md)
- [verifier-report.md](verifier-report.md)
- [reviewer-report.md](reviewer-report.md)
