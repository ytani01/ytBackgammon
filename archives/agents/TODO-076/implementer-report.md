# TODO-076 implementer の報告

置き場所を `~/.ytbg/` に統一し、CLI・環境変数・設定ファイルで変えられるようにした。

## 変更したファイル

### 新しく作ったもの

- `src/ytbg/paths.py`（全体）
  - `resolve(cli_dir=None, cli_config=None) -> Paths`。基準は
    `--dir` ＞ `YTBG_DIR` ＞ `~/.ytbg`、設定ファイルは `-c` ＞ `<基準>/ytbg.toml`、
    data / log / images は `[path]` ＞ `<基準>/<名前>`。
  - `[path]` の相対パスは `base / val` で解決（絶対パスならそのまま）。`~` は展開する。
  - `_path_table()`（`paths.py:58`）が `tomllib` で直接読む。設定ファイルが
    無ければ `{}`（既定で動く）。壊れたファイル、`[path]` が table でない、
    知らないキー、値が str でない、はすべて `ConfigError`。
  - `ConfigError` はここへ移した（`lobby.py` が import すると循環するため、
    定義をこちらに置いて `lobby.py` が読む側にした）。
  - ディレクトリは作らない（書くときに作る）。

- `tests/test_paths.py`（全体）— 優先順位（既定・環境変数・`--dir`・`-c`）、
  `~` の展開、`[path]` の絶対・相対、`[[board]]` だけの設定ファイル、
  設定の誤り 4 通り。

- `tests/test_cli.py`（全体）— `board` が設定から `port` / `image_dir` を取るか、
  CLI が勝つか、設定に無い `server_id` は既定か、`--dir` が保存先まで効くか、
  壊れた設定で起動前に止まるか、`lobby` の `-c` の既定と `[[board]]` が無いとき。
  サーバは起動せず、`_run()` と `create_app()` を差し替えて引数を見る。

### 直したもの

- `src/ytbg/server.py:59-65` — `os.getenv('YTBG_DATA_DIR') or os.getenv('HOME')`
  をやめ、`resolve().data / f'ytbg-{svr_id}.jsonl'`。`_datafile_path` は
  `str` から `Path` になった。`import os` を削除。
- `src/ytbg/storage.py:88` — `save()` で書く前に
  `self.path.parent.mkdir(parents=True, exist_ok=True)`。
- `src/ytbg/lobby.py:37,83-88` — `ConfigError` を `paths` から import。
  `board` キーが無い設定ファイルは `[]` を返す（`[path]` だけのファイルを
  `board` も読むため）。`board` があって list でない・空、はこれまで通りエラー。
- `src/ytbg/__main__.py`
  - `DIR_OPTION`（59-62）を `board` と `lobby` の両方に付けた。
  - `_set_base_dir()`（69-77）が `--dir` を `os.environ['YTBG_DIR']` へ移す。
    `BackgammonServer` と、lobby が起動するボードの子プロセスへ伝えるため。
  - `_board_config()`（80-85）が設定から `server_id` の合う `[[board]]` を探す。
  - `board`（93-126）: `--port` / `--image_dir` の `default` を `None` にして、
    指定されなければ設定 → `DEFAULT_PORT`(5001) / `DEFAULT_IMAGE_DIR`('images1a')。
  - `lobby`（129-155）: `-c` の既定を `None` にし、`resolve()` が
    `<基準>/ytbg.toml` を決める。`[[board]]` が 0 件なら `ClickException`。
- `tests/conftest.py:164,174,223` — `YTBG_DATA_DIR` を `YTBG_DIR` へ。
  末尾に `data_dir` フィクスチャ（`tmp_path/data`）を足した。
- `tests/test_save_load.py:306,322,335,342,387,389` — 先にファイルを置く
  テストは `tmp_path` から `data_dir` へ。
- `tests/test_ws.py:30,34,237` / `tests/test_lobby.py:10,261` — 環境変数名。
- `tests/test_lobby.py:82`（parametrize から `('', 'no [[board]]')` を外した）と
  `test_load_config_no_board_table`（215 付近を追加）。
- `tests/browser/helper.mjs:71,98`、`tests/browser/lobby.test.mjs:46` — `YTBG_DIR`。
- `docs/Admin.md` — board / lobby のオプション表に `--dir` と新しい既定、
  「置き場所」の節を新設（基準の優先順位・`[path]`・log と images はまだ使わない）、
  「状態の保存」を `~/.ytbg/data/...` に、「古い版からの移行」を新設
  （`mkdir -p ~/.ytbg/data` と `mv ~/ytbg-*.jsonl ~/.ytbg/data/`）、
  設定ファイルの節に `[path]` への案内、`~/ytbg/ytbg.toml` → `~/.ytbg/ytbg.toml`、
  systemd の `ExecStart` から `-c` を外した、「困ったとき」の退避先。
- `docs/Developer.md` — 全体の図のファイル名、モジュール表に `paths.py`、
  依存の図に `paths`、履歴の節の保存先、「気をつけること」に置き場所の決まり方と
  `load_config()` が空を返す件（TODO の番号は書いていない）。
- `README.md:126` — `ytbg lobby -c ytbg.toml` → `ytbg lobby`。
- `ytbg.toml` — 先頭のコメントに `[path]` と `board` の既定の説明。

## 検証

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 371 passed（終了コード 0） |
| `uv run ruff check .` | All checks passed |
| `uv run mypy src` | no issues found in 14 source files |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes |
| `node --test tests/browser/board.test.mjs` | 9 pass / 0 fail |
| `node --test tests/browser/lobby.test.mjs` | 5 pass / 0 fail |

ブラウザテストは、保存先の変更の影響を受ける 2 ファイルだけ走らせた
（一式は verifier の担当）。どれも 1 回ずつ。

## 判断が要る点・残る懸念

1. **`CLAUDE.md` の `YTBG_DATA_DIR` は直していない。** implementer は
   `CLAUDE.md` を触らない決まりなので、管理者か wording の担当で直してほしい。
   `git grep YTBG_DATA_DIR -- . ':!archives'` は `CLAUDE.md` と `TODO.md` の
   2 ファイルだけが残っている（`src/`・`tests/`・`docs/` は 0 件）。直す箇所:
   - 165 行目「保存先は `YTBG_DATA_DIR` で一時ディレクトリへ逃がす。この環境変数は」
     → 「保存先は `YTBG_DIR` で一時ディレクトリへ逃がす。この環境変数は」
   - 197-198 行目「保存先を環境変数 `YTBG_DATA_DIR`（無ければ `$HOME`）から
     組み立てる。`conftest.py` の `bg_server` フィクスチャが `YTBG_DATA_DIR` を
     `tmp_path` に差し替えている」→ 「保存先を `paths.resolve()` で決める
     （基準は環境変数 `YTBG_DIR`、無ければ `~/.ytbg`。保存先はその下の `data/`）。
     `conftest.py` の `bg_server` フィクスチャが `YTBG_DIR` を `tmp_path` に
     差し替えている」
2. **`--dir` は環境変数へ移す形にした**（`_set_base_dir()`）。`create_app()` と
   `BackgammonServer` に引数を足さずに済み、lobby の子プロセスにもそのまま
   伝わるため。`os.environ` を書き換えるので、テストでは `monkeypatch.setenv()`
   で触ってから CLI を呼び、後に残らないようにしている。
3. **lobby の `-c` は子プロセスへ渡していない。** `board` に `-c` が無いので、
   lobby の `-c` で基準の外の設定ファイルを指すと、`[path]` はボードに効かない
   （ボードは `<基準>/ytbg.toml` を見る）。`--dir`（＝ `YTBG_DIR`）は
   子プロセスへ伝わるので、基準を動かす使い方なら揃う。
4. **範囲外で気づいたこと**: `docs/Admin.md` の「**`-i` は毎回指定すること。**
   既定値は `static/` に無いディレクトリを指している」は、TODO-040 で既定が
   `images1a` になった時点で古い（今回の変更とは無関係）。直していない。
5. `Storage` のクラスの docstring にあった `~/ytbg-{server_id}.jsonl` は
   `~/.ytbg/data/...` に直した（ソースのコメントなので範囲内と判断した）。

---

## 追加（管理者の指示: lobby の `-c` を子へ伝える）

### 変更したファイル

- `src/ytbg/__main__.py`
  - `CONFIG_OPTION`（64-66）を切り出し、`board` と `lobby` の両方に付けた
    （型・説明・既定 `None` は同じ）。
  - `board`（108 付近）: `resolve(base_dir, config)` に `-c` を渡す。
    さらに `create_app(..., prefix, paths.data)` で**解決した data を渡す**。
    これをしないと、`BackgammonServer` が自分で `resolve()` を呼び直して
    `<基準>/ytbg.toml` を見てしまい、`-c` の `[path]` が保存先に効かない。
    環境変数は `YTBG_DIR` の 1 つだけという決めごとがあるので、
    `YTBG_CONFIG` のような環境変数は増やさず、引数で渡す形にした。
  - `lobby`: `create_lobby_app(boards, debug, prefix, paths.config)`。
- `src/ytbg/app.py` — `create_app()` に `data_dir=None` を足し、
  `BackgammonServer` へ渡す（docstring も追記）。
- `src/ytbg/server.py` — `BackgammonServer.__init__(svr_ver, svr_id, data_dir=None)`。
  渡されなければこれまで通り `resolve().data`。
- `src/ytbg/lobby.py` — `BoardProcess(conf, debug, config=None)` が
  `start()` で `-c <config>` を付けて子を起動する（`-i` の次、`--prefix` の前）。
  `create_lobby_app(..., config=None)` が各 `BoardProcess` へ渡す。
- `tests/test_cli.py` — `test_config_option`（`board -c` の `[[board]]` と
  `[path] data` が効く）、`test_lobby_passes_config_to_boards`、
  `test_lobby_default_config` に `config` の確認を追加。
- `tests/test_lobby.py` — `test_start_passes_config`（子のコマンドに
  `-c <path>` が入る）。既存の `test_start_passes_prefix` は `config` を
  渡さない呼び方なので、コマンドの並びは変わらず、そのまま通る。
- `docs/Admin.md` — board のオプション表に `-c`、lobby の `-c` に
  「子のボードにも渡す」、設定ファイルの節に 1 文。
- `docs/Developer.md` — 「気をつけること」に、`-c` を子へ渡すことと
  `board` が data を `create_app()` 経由で渡すことを追記。

### 検証

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 374 passed（終了コード 0） |
| `uv run ruff check .` | All checks passed |
| `uv run mypy src` | no issues found in 14 source files |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes |
| `node --test tests/browser/lobby.test.mjs` | 5 pass / 0 fail |

**わざと壊して確かめた**（2 通り、それぞれ 1 回）。

- `BoardProcess.start()` の `-c` を渡す 2 行を消す
  → `test_start_passes_config` だけが落ちる
- `create_app()` の `BackgammonServer(svr_ver, svr_id, data_dir)` から
  `data_dir` を外す → `test_config_option` だけが落ちる

### 残る懸念

- `-c` は「設定ファイルの場所」だけを指し、基準（`--dir` / `YTBG_DIR`）は
  変えない。`-c /etc/ytbg/x.toml` だけを指定して `[path]` を書かないと、
  data は `~/.ytbg/data` のままになる。設計どおりだが、利用者には
  分かりにくいかもしれない（`docs/Admin.md` の「置き場所」には書いてある）。

---

## 追加 2（reviewer の指摘への対応。管理者が決めた 1〜5 だけ）

### 1. `_set_base_dir()` を消し、子へ `--dir` を渡す

- `src/ytbg/__main__.py` — `_set_base_dir()` と `_board_config()` を削除
  （`import os` と `from pathlib import Path` も不要になった）。
  `board` / `lobby` は `resolve(base_dir, config)` の結果だけを使う。
- `src/ytbg/lobby.py` — `BoardProcess(conf, debug, paths=None)` に変えた
  （前の `config` 引数を `Paths` に置き換え）。`start()` は
  `-i` の次に `--dir <paths.base> -c <paths.config>` を付ける。
  `create_lobby_app(..., paths=None)` も同じ。`-c` と `--dir` が
  同じ経路（引数）で子へ渡る。
- `tests/test_cli.py` — `run` フィクスチャの但し書きを消した
  （`YTBG_DIR` の `setenv` は、基準を `tmp_path` に向けるために残す。
  CLI が環境変数を書き換えることはもう無い）。
- `tests/test_lobby.py` — `test_start_passes_config` を
  `test_start_passes_paths` にし、子のコマンドに `--dir` と `-c` の
  両方が入ることを見る。

### 2. `docs/Admin.md` の矛盾

「**`-i` は毎回指定すること。** 既定値は `static/` に無いディレクトリを
指している」を、「省いたときは設定ファイルの `image_dir`、それも無ければ
`images1a`」に書き換えた。

### 3. `board` は自分の項目だけを見る

- `src/ytbg/lobby.py` — `load_config()` を 3 つに分けた。
  `_entries()`（TOML を読んで `[[board]]` のリストを返す）、
  `_parse_board(ent, where)`（1 項目ぶんの検証。中身は元のまま）、
  `load_config()`（全項目 + 重複の検査。lobby 用）。
  新しい `board_config(path, server_id)` は、**`server_id` が合う項目だけ**を
  `_parse_board()` に通す。設定ファイルが無ければ `None`、合う項目が
  無ければ `None`、**自分の項目が壊れていれば `ConfigError`**（黙って
  無視はしない）。
- `src/ytbg/__main__.py` — `board` は `board_config(paths.config, server_id)`。
- テスト: `tests/test_lobby.py` に `board_config()` の 5 件
  （合う項目・無い項目・ファイルが無い・他の項目が壊れていても読める・
  自分の項目が壊れていればエラー）と、`load_config()` が全項目を見ること。
  `tests/test_cli.py` に `test_other_entry_error` と `test_own_entry_error`。

### 4. 経路を引数の 1 本に寄せる

- `src/ytbg/server.py` — `BackgammonServer(svr_ver, svr_id, data_dir)`。
  `data_dir` は必須で、`resolve()` は呼ばなくなった（import も消した）。
- `src/ytbg/app.py` — `create_app(svr_name, svr_ver, svr_id, image_dir,
  data_dir, prefix='')`。**`data_dir` を必須にするため `prefix` の前に置いた**
  （引数の順が変わったので、呼ぶ側は `__main__.py` と `tests/test_ws.py`）。
- `tests/conftest.py` — `YTBG_DIR` の差し替えをやめ、
  `BackgammonServer(..., data_dir=tmp_path / 'data')` を渡す。`HOME` の
  逃がしだけ残した。
- `tests/test_ws.py` — `create_app(..., tmp_path)` / `(..., tmp_path, '/foo')`。
- `tests/test_datafile_dir.py` — 環境変数の優先順位を見るテスト
  （`tests/test_paths.py` と重複）を消し、「渡された保存先 +
  `ytbg-{id}.jsonl`」と「書くときにディレクトリを作る」の 2 件にした。

### 5. `load_config()` の空の扱い

`_entries()` は `data.get('board', [])` にし、list でなければ
`no [[board]]`、空のリストはそのまま `[]`。`board` キーが無いときと
`board = []` のときが揃った。`tests/test_lobby.py::test_load_config_no_board_table`
を 2 通りの parametrize にした。

### 文書

- `docs/Developer.md` — 「気をつけること」の置き場所の項を書き直した
  （置き場所を決めるのは `__main__.py` だけ／保存先は引数で渡す／子へは
  `--dir` と `-c` で渡し、環境変数で暗黙に渡さない／`board` は自分の項目
  だけを見る／`board = []` も空のリスト）。モジュール表の `lobby.py` に
  `board_config()` を追記。
- `docs/Admin.md` — 上の 2 に加えて、設定ファイルの節に「`ytbg board` が
  見るのは自分の項目だけ」と「lobby は `-c` と `--dir` を子へ渡す」。

### 検証

| コマンド | 結果 |
|----------|------|
| `uv run pytest` | 380 passed（終了コード 0） |
| `uv run ruff check .` | All checks passed |
| `uv run mypy src` | no issues found in 14 source files |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes |
| `node --test tests/browser/lobby.test.mjs` | 5 pass / 0 fail（子の起動コマンドが変わったため） |

**わざと壊して確かめた**（それぞれ 1 回）。

- `BoardProcess.start()` から `--dir` を落とす → `test_start_passes_paths` が落ちる
- `board_config()` を `load_config()` 経由（全項目を検証）に戻す →
  `test_board_config_ignores_other_entries` と
  `tests/test_cli.py::test_other_entry_error` が落ちる
- `_entries()` を `board = []` でエラーにする →
  `test_load_config_no_board_table` の 2 件が落ちる
- `Storage.save()` の `mkdir()` を消す → `test_data_dir_is_made_when_saving` が落ちる

### CLAUDE.md の差し替え案（管理者へ。こちらでは触っていない）

165-167 行目付近と 197-199 行目付近が、4 の変更で実装と合わなくなる。

- 「保存先は `YTBG_DIR` で一時ディレクトリへ逃がす。この環境変数は
  `BackgammonServer` を作るときに読み（TODO-055）、無ければ `$HOME`。」
  → 「保存先は `YTBG_DIR` で一時ディレクトリへ逃がす。この環境変数を読むのは
  `paths.resolve()` で、それを呼ぶのは `__main__.py` の `board` と `lobby`
  だけ（TODO-076）。ブラウザテストはサーバを実プロセスで起動するので、
  この経路を通る。」
- 「`BackgammonServer` はコンストラクタの中で `load_data()` を呼び、
  保存先を環境変数 `YTBG_DATA_DIR`（無ければ `$HOME`）から組み立てる。
  `conftest.py` の `bg_server` フィクスチャが `YTBG_DATA_DIR` を `tmp_path` に
  差し替えている」
  → 「`BackgammonServer` はコンストラクタの中で `load_data()` を呼ぶ。
  **保存先は引数 `data_dir` で渡す**（環境変数も設定ファイルも読まない。
  TODO-076）。`conftest.py` の `bg_server` フィクスチャが
  `tmp_path / 'data'` を渡している」

### 見送った指摘（管理者の指示どおり）

reviewer の 6〜14 には手を付けていない。
