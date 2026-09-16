# TODO-076 verifier の報告（2 回目、reviewer 指摘への対応分）

対象: reviewer-report.md の「要修正」1〜3 への対応と「検討」4・5 への対応
（implementer-report.md の「追加 2」）。前回の verifier-report.md 済みの分は
やり直していない。

## 1〜5 が実装に入っているか

いずれもソースを直接読んで確認した（説明文だけでなく実装本体）。

1. **`_set_base_dir()` は無い。** `src/ytbg/__main__.py` に `import os` は
   無く、`_set_base_dir` という名前も存在しない。`board` / `lobby` はどちらも
   `resolve(base_dir, config)` の結果（`paths`）だけを使っている。
   `src/ytbg/lobby.py` の `BoardProcess.start()`（228-233 行）が
   `--dir <paths.base> -c <paths.config>` を子のコマンドラインに直接足す形。
   `docs/Developer.md` の説明もこの形に合わせて書き換わっている。
2. **`docs/Admin.md:53` 付近**は「`-i` を省いたときは、設定ファイルの
   `image_dir`、それも無ければ `images1a` で」に直っており、「毎回指定する
   こと」の誤った文は残っていない。
3. **`board_config()`** は `src/ytbg/lobby.py:149-165` にあり、
   `_entries()` でループしながら `server_id` が一致した項目だけを
   `_parse_board()` に通し、他の項目は検証しない。`load_config()`（lobby 用）
   は従来どおり全項目を検証する、別関数のまま。
4. **`data_dir` は必須。** `src/ytbg/server.py:53`
   `def __init__(self, svr_ver, svr_id, data_dir: str | Path):`、
   `src/ytbg/app.py:76-77` `def create_app(svr_name, svr_ver, svr_id,
   image_dir, data_dir, prefix: str = '') -> Starlette:`。どちらも
   デフォルト値が無く、`resolve()` を呼ぶコードはこの 2 つのファイルから
   消えている（`import` も無い）。`tests/conftest.py` は
   `BackgammonServer(..., data_dir=tmp_path / 'data')` を渡す形。
5. **`load_config()` の空の扱い**は `_entries()`
   （`src/ytbg/lobby.py:63-79`）に一本化され、`board` キーが無いときは
   `data.get('board', [])` で `[]`、`board = []` も同じ `[]` になる
   （`isinstance` チェックのみ list でなければエラー）。

実装と説明の食い違いは見つからなかった。

## 検証の一式（1 回ずつ）

| コマンド | 結果 |
|---|---|
| `uv run pytest` | 380 passed（終了コード 0） |
| `uv run ruff check .` | All checks passed（終了コード 0） |
| `uv run mypy src` | no issues found in 14 source files（終了コード 0） |
| `uv run basedpyright` | 0 errors, 0 warnings, 0 notes（終了コード 0） |
| `node --test tests/js/` | 154 pass / 0 fail |
| `node --test tests/browser/` | 106 pass / 0 fail（約 73 秒） |

どれも 1 回だけ走らせた。落ちたものは無い。

## 実プロセスでの確認（一時ディレクトリ、`~/.ytbg/` や `~/ytbg-*` は未使用）

一時ディレクトリに `ytbg.toml` を置いて確認した
（`/tmp/claude-.../scratchpad/verify1`）。

- **`[[board]] server_id="9"`（正しい）と `server_id="7"`（`port` 無し）を
  両方書いた状態**で `ytbg board --dir <tmp> 9` を実行 → **起動した**
  （`curl` で 200、ログに `server_id=9, port=..., base=<tmp>` が出た）。
  プロセスは `kill -TERM -<pgid>` で確実に止め、`ps -p` で消えたことを確認。
- 同じ設定ファイルで `9` の項目自体を壊す（`port` を消す）と、
  `ytbg board --dir <tmp> 9` は
  `Error: <tmp>/ytbg.toml: [[board]] #1: "port" is required` で
  exit 1（**止まった**）。
- `ytbg lobby --dir <tmp>` は（`7` が壊れたままの設定で）
  `Error: <tmp>/ytbg.toml: [[board]] #2: "port" is required` で
  exit 1（**lobby は全件検証のまま**、止まった）。
- `ytbg lobby --dir <tmp>` を正しい設定（`9` だけ）で起動し、子プロセスの
  実際のコマンドラインをログで見た。
  ```
  start: [..., 'python', '-m', 'ytbg', 'board', '-p', '15909', '-i', 'images1a',
  '--dir', '<tmp>', '-c', '<tmp>/ytbg.toml', '--', '9']
  ```
  `--dir` と `-c` が両方子へ渡っていることを実測した（`ps --forest` でも
  親子関係を確認）。lobby・子とも `kill -TERM -<pgid>` で止め、
  `ps -p` で消えたことを確認した。

## わざと壊して確かめたこと（3 通り。壊した後は必ず元に戻した）

いずれも `git diff` で元に戻ったことを確認済み（`git status --porcelain` が
作業開始時と同じ、`uv run pytest` が壊す前と同じ 380 passed に戻った）。

1. **項目 3（`board_config` が自分の項目だけ見る）**:
   ループの中で、一致判定の**前に** `_parse_board()` を無条件で呼ぶように
   変更（「他の項目も検証してしまう」ふうの壊し方）。
   → **既存のテスト（`test_board_config_ignores_other_entries` ほか）は
   1 件も落ちなかった**。理由は、テストの `BOARD + BROKEN` の並びが
   「正しい項目が先、壊れた項目が後」で固定されているため。
   `board_config()` は一致した時点でループを抜けるので、正しい項目が
   先にあると、壊れた項目まで読みに行く前に return してしまい、
   「無条件で検証する」壊し方でも通ってしまう。
   **手で確認**したところ（壊れた項目を先に置いた設定ファイルで
   `uv run python3 -c '...'` を実行）、この壊し方は実際には
   「壊れた項目が探している項目より前にあると誤って ConfigError になる」
   というバグを生む。つまり **今回追加されたテストは、壊れた項目が
   目的の項目より後ろにあるケースしか見ていない**（順序依存のテストの
   抜け）。ただし、**直っている実装そのもの**（`if` が先、`_parse_board`
   は一致したときだけ呼ぶ）は、不一致の項目を一切パースしないので、
   順序に関係なく問題は起きない。実装は正しいが、テストの網羅は
   一方向に偏っている。
2. **項目 1（`--dir` を子へ渡す）**: `BoardProcess.start()` の
   `if self.paths:` を `if False and self.paths:` にして、
   `--dir` / `-c` を子へ渡さないようにした。
   → **`test_start_passes_paths` だけが落ちた**（期待どおり）。
   ```
   E       AssertionError: assert ['-p', '5001'...2', '--', '1'] == [...]
   E       At index 4 diff: '--' != '--dir'
   ```
3. 上記の作業中、`git checkout -- src/ytbg/lobby.py` を誤って実行し
   （コミット前の HEAD へ戻ってしまう操作）、一時的に TODO-076 の変更を
   失いかけた。直前に取っていた diff（`git diff` の出力）を
   `git apply` で当て直し、`uv run pytest` が壊す前と同じ 380 passed に
   戻ることと、ファイルの中身がこの報告の最初に読んだ内容と一致することを
   確認して復旧した。**最終的に取り違いは残っていない**
   （`git status --porcelain` は作業開始時と同じ一覧）。

## `YTBG_DATA_DIR` の grep

```
$ git grep -n YTBG_DATA_DIR -- ':!archives'
TODO.md:44:| データ | ... | YTBG_DATA_DIR のみ（CLI 無し）|
TODO.md:62:- YTBG_DATA_DIR は残さず、YTBG_DIR に置き換える。テストも直す
```

`src/`・`tests/`・`docs/` には 0 件。`TODO.md` の説明文（経緯）だけに
残っており、指示どおり。

## 変更されたファイルと指示の範囲

`git status --porcelain` は作業開始時と同じ 17 件の `M` と 4 件の `??`
（`archives/agents/TODO-076/`・`src/ytbg/paths.py`・`tests/test_cli.py`・
`tests/test_paths.py`）で、5 件の修正の説明（`__main__.py`・`lobby.py`・
`server.py`・`app.py`・`docs/Admin.md`・`docs/Developer.md`・
`tests/test_lobby.py`・`tests/test_cli.py`・`tests/conftest.py`・
`tests/test_ws.py`・`tests/test_datafile_dir.py`）と一致する。
指示に無いファイルが変わっている様子は無い。

## 残る懸念・判断が要る点

- **項目 3 のテストに順序依存の抜けがある**（上の「わざと壊して確かめた 1」）。
  `tests/test_lobby.py` の `BROKEN`（壊れた項目）が常に `BOARD`（正しい項目）
  の**後ろ**にある構成でしか確認していない。実装自体は不一致の項目を
  パースしないので実害は無いと判断したが、**「壊れた項目が探している
  項目より前にある」ケースのテストが無い**のは事実。テストを直すか
  どうかは管理者の判断が要る。
- reviewer の「検討」6〜14（`no [[board]]` の文言が 2 か所、設定ファイルの
  2 回パース、最上位キーの未検証、相対パスなど）は implementer が
  「見送った」としている項目で、今回は確認していない（指示の対象外）。
- `CLAUDE.md` の `YTBG_DATA_DIR` の書き換え（implementer 報告の
  「CLAUDE.md の差し替え案」）が実際に反映されているかは、今回の
  確認対象（ソース 5 件）に入っていないため見ていない。`git diff CLAUDE.md`
  には変更が含まれている（gitStatus の `M CLAUDE.md`）が、内容の当否は
  wording の担当が見る話だと理解している。
