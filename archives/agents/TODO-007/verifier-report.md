# TODO-007 検証報告（verifier）

## 対象の変更（`git diff`）

- `src/ytbg/yt_backgammon.py`: `init_gameinfo()` から `'roll': False,` の行を削除
- `tests/test_save_load.py`: `test_save_and_load_roundtrip` から `board.roll` を
  比較前に取り除く処理と、その説明の docstring を削除

他に変更されたファイルは無い（`git status` はこの 2 ファイルのみ）。指示の範囲と一致している。

## 1. クライアント側（ytbg.js / index.html）が `gameinfo.board.roll` を読み書きしていないこと

`src/ytbg/webroot/static/ytbg.js` 全体で `roll` を含む識別子を洗い出した
（`SOUND_ROLL`、`roll_btn`、`RollButton.roll()`、`emit_dice()` が送る
プロトコルの `data.roll`（サイコロを振った直後かどうかを示すフラグ、
`gameinfo` の中身とは別物）、`msg.data.roll` など）。これらはいずれも
`gameinfo.board.roll` ではない。

`gameinfo` を組み立てる/取り込む経路である `Board.gen_gameinfo()`
（3450〜3492 行）と `Board.load_gameinfo()`（3532〜 行、`gameinfo.board.checker`
`gameinfo.board.clock` `gameinfo.board.playername` 等を参照）を読んだ限り、
`gameinfo.board.roll`（あるいは `.board['roll']`）という参照は無い。
`board\.roll` という文字列一致でも該当箇所は 0 件だった。

`src/ytbg/webroot/templates/index.html` 内の `roll` は `rollbutton0` /
`rollbutton1` という DOM の id のみで、`gameinfo` とは無関係。

以上より、クライアント側は `gameinfo.board.roll` を読み書きしていない。

## 2. サーバ側（`src/ytbg/` の Python 全体）に参照が残っていないこと

`grep -rn "\broll\b" src/ytbg/*.py` は 0 件（変更後の `yt_backgammon.py` を含め、
`.py` ファイルのどこにも `roll` という語自体が出てこない）。

## 3. 既存の保存ファイルがそのまま読めること

- 利用者の実ファイル `~/ytbg-1.json` `~/ytbg-2.json` `~/ytbg-3.json`
  `~/ytbg-4.json` の 4 つとも存在した。`grep -c '"roll"'` はいずれも `0`、
  つまり `roll` キーは元々含まれていない（`hist_ent2str()` がそもそも
  `roll` を出力していなかったため、消す前から書かれていなかった）。
- `DATAFILE_DIR` を一時ディレクトリへ差し替えたうえで
  `ytBackgammonServer` を生成し（コンストラクタ自身の
  `load_data()` は存在しない一時パスに対して呼ばれ、`FileNotFoundError` の
  警告ログのみで例外は投げない仕様どおりに終わる）、そのインスタンスの
  `load_data()` を実ファイルのパスに対して明示的に呼び出した。
  4 ファイルとも例外なく読み込め、それぞれ履歴件数
  `23 / 1 / 37 / 1` を返した。
- 実行前後で `md5sum ~/ytbg-*.json` を比較し、内容が変わっていないこと
  （読むだけで書き換えていないこと）を確認した。

## 4. `uv run pytest` / `uv run ruff check .` / `uv run mypy src`

- `uv run pytest`: `16 passed`（終了コード 0）
- `uv run ruff check .`: `All checks passed!`（終了コード 0）
- `uv run mypy src`: `Found 7 errors in 1 file (checked 5 source files)`
  （終了コード 1）。エラーは全て `src/ytbg/__main__.py`（55, 61, 67, 72, 78,
  83, 89 行、`"None" has no attribute "..."` 系）で、`board.roll` や
  `yt_backgammon.py` とは無関係。
  **変更前（`git stash` で今回の diff を退避した状態）でも同じ 7 件・
  同じ内容・同じ行番号が出ることを確認した**。今回の変更で mypy の指摘は
  増えていない（CLAUDE.md にある「既存の指摘が残っている」件と一致）。

## 追加で確かめたこと（テストが実際に効いているかの検証）

指示には無いが、削除したテストの前処理（`pop('roll', None)`）が本当に
意味のある変更なのかを確かめるため、**ソース側の変更だけを一時的に取り消し**
（`init_gameinfo()` に `'roll': False,` を戻す）、テスト側の変更はそのまま
にして `tests/test_save_load.py` を実行した。

結果、`test_save_and_load_roundtrip` は次のように **想定どおり失敗した**
（`saved_history` に `roll` が残るが、`save_data()`/`hist_ent2str()` が
`roll` を書き出さないため往復後の履歴と一致しない）。

```
E       AssertionError: assert [{'sn': 1, 's...ore': 0, ...}] == [{'sn': 1, 's...ore': 0, ...}]
...
FAILED tests/test_save_load.py::test_save_and_load_roundtrip - AssertionError...
========================= 1 failed, 7 passed in 0.07s ==========================
```

確認後、`git apply` でソース側の変更を復元し、`git diff --stat` と
`uv run pytest -q`（16 passed）で元の状態に戻っていることを確認した。

## 判断できなかったこと・確かめられなかったこと

- ブラウザを実際に開いての手動確認（サイコロを振る、盤面を動かす等）は
  行っていない。CLAUDE.md の方針どおり「クライアントの JS はテストしていない」
  範囲であり、`grep` とコードの読み込みによる静的な確認にとどまる。
  `roll_btn` 周りの動作に影響が無いことは、コード上 `gameinfo.board.roll` を
  一切参照していないことから推測できるが、実機での目視確認はしていない。
- `~/ytbg-*.json` 以外に `roll` キーを含む古い保存ファイルが
  どこか別の場所に残っていないかまでは調べていない（指示にあった
  `~/ytbg-*.json` のみを確認した）。
