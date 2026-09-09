# TODO-006 実装報告（implementer）

## 変更したファイル

- `pyproject.toml` — `uv add --dev pytest` により `[dependency-groups].dev`
  に `pytest>=9.1.1` を追加。`[tool.pytest.ini_options]` に
  `testpaths = ["tests"]` を追加
- `uv.lock` — `uv add` の結果として更新（pytest とその依存 6 パッケージ）
- `tests/conftest.py`（新規）— `bg`（`ytBackgammon`）、`emitted`、
  `bg_server`（`ytBackgammonServer`）のフィクスチャ。
  `bg_server` は `monkeypatch.setattr(ytBackgammonServer, 'DATAFILE_DIR',
  str(tmp_path))` で保存先を差し替え、`monkeypatch.setattr(
  yt_backgammon_server, 'emit', fake_emit)` で SocketIO の `emit` を
  差し替えている（呼び出し引数は `emitted` に積む）
- `tests/test_yt_backgammon.py`（新規）— 4 本。`init_gameinfo()` の構造、
  `put_checker()` の ID → player 計算、`cube()`/`dice()`、`set_turn()`
- `tests/test_history.py`（新規）— 4 本。`add_history()` の sn 採番、
  `backward_hist()`/`forward_hist()`（`sleep_sec=0` で呼ぶ）、
  `backward_hist(-1, ...)` で全戻し、`hist_ent2str()`
- `tests/test_save_load.py`（新規）— 2 本。`save_data()` → `load_data()`
  の往復、存在しないファイルを読ませたときの `(0, 0)`

`src/` は 1 行も変更していない。`TODO.md` / `CLAUDE.md` / `archives/todo/`
も変更していない。

## 見つけたが直していない不具合（範囲外・報告のみ）

**`hist_ent2str()`（`yt_backgammon_server.py:200-228`）が
`gameinfo['board']['roll']` を出力していない。** `init_gameinfo()`
（`yt_backgammon.py:61`）は `board.roll` を持つが、`save_data()` は
`hist_ent2str()` で手組みの文字列を作っており `roll` キーが無いため、
保存 → 読み込みの往復で `board.roll` が失われる。

`test_save_and_load_roundtrip` はこの差異を踏まえ、比較前に
両辺から `board.roll` を取り除く形にしている（テスト内にコメントで
経緯を書いた）。別項目にするかどうかは管理者判断。

## 検証結果

- `uv run pytest` → `10 passed`（終了コード 0）
- `uv run ruff check .` → 19 件のエラー。**すべて `src/` 側の既存指摘**
  （`git stash` して変更前の状態でも同じ 19 件であることを確認済み）。
  `tests/` からの新規指摘は無し
- `uv run mypy src` → 9 件のエラー。**変更前と同じ 9 件**（`src/` を
  変更していないため件数は変わらない。`mypy src` は `tests/` を
  対象にしないコマンドなのでテストコードは検査対象外）

## 判断が要る点・残る懸念

- 上記の `board.roll` が保存で失われる件を、別の TODO 項目にするか
- `mypy` は `tests/` を対象外にしたコマンド（`CLAUDE.md` の指示どおり
  `uv run mypy src` のみ実行）。`tests/` 自体の型検査はしていない
