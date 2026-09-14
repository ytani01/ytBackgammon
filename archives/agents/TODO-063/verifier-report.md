# TODO-063 確認の報告（verifier）

## 1. 検証の一式（各 1 回）

| コマンド | 結果 | 終了コード |
|----------|------|-----------|
| `uv run pytest` | 328 passed, 1 warning（warning は starlette の `TestClient` の `DeprecationWarning` で前からある） | 0 |
| `uv run ruff check .` | All checks passed | 0 |
| `uv run mypy src` | Success: no issues found in 13 source files | 0 |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes | 0 |
| `node --test tests/js/` | tests 156, pass 156, fail 0 | 0 |
| `node --test tests/browser/` | tests 102, pass 102, fail 0（`lobby の一覧ページ` の 3 件を含む） | 0 |

## 2. `node --test tests/browser/lobby.test.mjs` の連続実行

**main の指示により、10 回連続の実行は取りやめ。** 上の「検証の一式」の
`node --test tests/browser/` の中で 1 回走らせ、`lobby の一覧ページ` の
3 件（iframe の src、選択の保持、停止・起動のボタン）はすべて通った
（13.7 秒）。それ以上の連続実行はしていない。

## 3. 手で試したこと

`docs/Admin.md` の「複数のボードを立てる」「止める」に沿って行った。
リポジトリの `ytbg.toml` は使わず、scratchpad に空きポート（lobby: 52807、
b1: 36259、b2: 60389）の設定を書き、`YTBG_DATA_DIR` を scratchpad 内の
一時ディレクトリにして試した。

- **起動:** `uv run ytbg lobby -c <設定> -p 52807` で b1・b2 が子プロセスとして
  起動し、`pgrep -af 'ytbg (board|lobby)'` で 3 プロセス（lobby・board×2）を確認。
  `/api/boards` は両方 `running: true, listening: true`（動作中）
- **停止・起動:** `POST /api/boards/b1/stop` → `running: false, listening: false,
  pid: null`（停止中）。`POST /api/boards/b1/start` → 直後の応答は
  `running: true, listening: false`（起動中）、0.5 秒後に `listening: true`
  （動作中）に変わった
- **lobby への SIGTERM:** lobby のプロセスへ `kill -TERM` を送ると、
  `pgrep -af 'ytbg (board|lobby)'` が何も返さなくなった（子も含めて全部止まる）。
  lobby のログにも両方の `_wait(): exited (..., returncode=-15)` が出た
- **ポートが塞がったボード:** b1 のポート（36259）を Python の素のソケットで
  先に listen させてから lobby を起動すると、b1 は `running: false,
  listening: false`（停止中）、b2 は動作中。lobby のログに
  `ERROR: [Errno 98] error while attempting to bind on address (...): address
  already in use` と `_wait(): exited (..., returncode=3)` が出た
  （Admin.md の「起動できない理由がそのまま端末に出て、終了コードがログに出る」
  のとおり）
- **誤った設定で traceback にならないこと:**
  - `server_id` の重複（`1` と `"1"`）→ `Error: ...: duplicate server_id: 1`、終了コード 1
  - `url = "/board1/"`（パスだけ）→ `Error: ...: "url" must start with http:// or https://`、終了コード 1
  - `url = "http://h:99999/"`（ポート範囲外）→ `Error: ...: "url" is invalid: Port out of range 0-65535`、終了コード 1
  - いずれも traceback は出ず、Python の例外の代わりに 1 行のエラー文で止まった
- **`--help`:** `uv run ytbg board --help` は `Usage: ytbg board [OPTIONS] SERVER_ID`
  と `-p/-i/-d/-h`。`uv run ytbg lobby --help` は `Usage: ytbg lobby [OPTIONS]` と
  `-c（既定 ytbg.toml）/-p（既定 5000）/-d/-h`。どちらも `docs/Admin.md` の
  オプション表と一致

試したあと、`pgrep -af 'ytbg (board|lobby)'` の終了コードが 1（該当なし）に
なることを確かめ、lobby・ボードとも残っていないことを確認した。

## 4. 壊して確かめたこと（3 通り。すべて `Write` で戻し、`cmp` で元と一致を確認済み）

依頼にある必須の 1 つを含め、implementer の 24 通りと重ならないものを選んだ。

| 壊し方 | 結果 | 元との一致 |
|--------|------|-----------|
| `lobby.py` の `url` 検証で `_ = parts.port` の行を消す（依頼の必須項目） | `test_load_config_error` のうち `url = "http://h:99999/"` と `url = "http://h:abc/"` の 2 件が `DID NOT RAISE ConfigError` で失敗。ほかの 34 件は通った（`http://[::1` は `urlsplit()` 自体が `ValueError` を出すので、この行を消しても落ちない。想定どおり） | cmp で一致 |
| 重複判定のループを `for key in ('server_id',):` にし、`port` の重複を見なくする | `duplicate port: 5001` を期待する 1 件だけが失敗。ほかは通った | cmp で一致 |
| `create_lobby_app()` の `action()` で `if p is None:` を `if False:` にする（未知の `server_id` を 404 にしない） | `test_unknown_server_id[start]`・`[stop]` の 2 件が `500 == 404` で失敗。ほかは通った | cmp で一致 |

いずれも復元後に `uv run pytest -q` を実行し、328 passed に戻ることを確認した。

## 5. TODO-063 のチェックリストの判定

- [x] `ytbg` をサブコマンドに分ける（`ytbg board 1 -p 5001` / `ytbg lobby -c ytbg.toml`）。
  `--help` で確認済み
- [x] 設定ファイル（TOML、`tomllib`）に server_id・ポート・画像ディレクトリ・URL（省略可）。
  `load_config()` と `tests/test_lobby.py` で確認
- [x] lobby は起動時に設定のボードを全部子プロセスとして起動する。lobby を止めると
  （SIGTERM で確認。Ctrl+C は同じ経路の SIGINT なので同様と判断するが、実際に
  Ctrl+C を送って試してはいない）ボードも止まる
- [x] 一覧ページにボードごとの状態（停止中・起動中・動作中）と起動・停止ボタン
  （手で `/api/boards` と `lobby.test.mjs` で確認）
- [x] 一覧ページは選んだ 1 面を大きく、残りを小さく iframe で並べる
  （`lobby.test.mjs` の「選んだボードが大きい枠になり」で確認。画面を目視では
  していない）
- [x] iframe の URL は既定でホスト名＋ポート、設定に `url` があればそちら
  （`lobby.test.mjs` の「iframe の src」で確認）
- [x] `ytbg-boot.sh`・`ytbg-stop.sh`・`ytbg.html` を消し、`ytbg.sh`・README・docs・
  CLAUDE.md を書き換え（`git status` で 3 ファイルが `D`、他が `M`/`??` になっている
  ことを確認。文面の細部までは読んでいない）
- [x] テストを足す（`tests/test_lobby.py` 32 件、`tests/browser/lobby.test.mjs` 3 件。
  上の一式で確認）

すべて満たしていると判断する。チェックは付けていない（main が付ける）。

## 確かめられなかったこと・判断が要る点

- **Ctrl+C（SIGINT）そのものは試していない。** SIGTERM で「lobby を止めると
  ボードも止まる」ことは確認したが、Ctrl+C は端末のプロセスグループに直接
  届く経路なので、`implementer-report.md` にある「子は lobby と同じプロセス
  グループなので Ctrl+C はボードにも直接届く」という記述の検証はしていない。
  実害は無いと考えるが、判断が要るなら別途試すべき
- **画面の見た目（大小の配置やボタンの色）は目視していない。** `lobby.test.mjs`
  が DOM の class やサイズを見ているので機能としては確認済みだが、
  スクリーンショットは撮っていない
- **`node --test tests/browser/lobby.test.mjs` の 10 回連続実行は、main の指示で
  取りやめた。** 「起動中」を見るテストがタイミングで落ちる余地は reviewer が
  `reviewer-report-2.md` の「好みの範囲」で検討済み（`wait_for` の戻り値で
  assert するよう直っており、落ちる余地はほぼ無いと判断されている）。今回は
  一式の中の 1 回のみで、それ以上の反復では確かめていない
